import type { SupabaseClient } from "@supabase/supabase-js"
import {
  normalizeLegacyCompatibilityScore,
  normalizeLegacySessionCount,
} from "./legacy-import-normalize"
import { normalizeLegacyGender } from "./round-import-utils"
import { supportsImportMetadataColumn } from "./import-metadata-column"
import { loadRoundImportContext } from "./round-import-context"
import { resolveImportRows } from "./round-import-resolver"
import type {
  GenderOverrideMap,
  ImportSummary,
  LegacyOverrideMap,
  PreparedImportRow,
  ResolvedImportRow,
} from "./round-import-types"

export type RoundImportAuditOperation = "create" | "delete" | "restore" | "submission_replace"

export interface RoundImportAuditFile {
  sha256: string
  sizeBytes: number
  extension: "xlsx"
}

export interface RoundImportAuditRequest {
  memberId: string
  operation: RoundImportAuditOperation
  reason: string
  metadata: {
    event_scope: "round_excel_member_import"
    round: { id: string }
    file: { sha256: string; size_bytes: number; extension: "xlsx" }
    row: { number: number | null }
    phase: "apply" | "compensation"
    write_stage: "before_service_write" | "after_service_write" | "after_compensation"
    service_write_performed: boolean
    atomic_with_service_write: false
    related_record?: RoundSubmissionRelatedRecordAudit
  }
}

export interface RoundSubmissionRelatedRecordAudit {
  entity: "match_round_submissions"
  operation: "round_replace"
  snapshot_role: "before" | "after" | "after_compensation_clear" | "after_compensation"
  changed_fields: Array<
    | "submission_presence"
    | "game_type_pref"
    | "gender_pref"
    | "availability"
    | "interest_tags"
    | "social_style"
    | "message"
  >
  compensation_step?: "clear_current" | "restore_previous"
  compensation_succeeded?: boolean
}

export interface RoundImportAuditOptions {
  reason: string
  file: RoundImportAuditFile
  recordEvent: (request: RoundImportAuditRequest) => Promise<void>
}

interface CreatedImportMember {
  memberId: string
  rowNumber: number
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message) return message
  }
  return "未知错误"
}

function withCompensationErrors(primary: unknown, compensationErrors: unknown[]) {
  if (compensationErrors.length === 0 && primary instanceof Error) return primary
  const suffix = compensationErrors.length > 0
    ? `；补偿失败：${compensationErrors.map(errorMessage).join("；")}`
    : ""
  return new Error(`${errorMessage(primary)}${suffix}`)
}

function assertAuditOptions(audit: RoundImportAuditOptions) {
  const reason = audit.reason.trim()
  const reasonLength = Array.from(reason).length
  if (reasonLength < 4 || reasonLength > 500) {
    throw new Error("导入原因需为 4-500 个字符")
  }
  if (!/^[a-f0-9]{64}$/.test(audit.file.sha256)) {
    throw new Error("导入文件指纹无效")
  }
  if (!Number.isSafeInteger(audit.file.sizeBytes) || audit.file.sizeBytes < 0) {
    throw new Error("导入文件大小无效")
  }
  return reason
}

async function recordImportAudit(
  audit: RoundImportAuditOptions,
  roundId: string,
  memberId: string,
  operation: RoundImportAuditOperation,
  rowNumber: number | null,
  phase: "apply" | "compensation",
  writeStage: "before_service_write" | "after_service_write" | "after_compensation",
  serviceWritePerformed: boolean,
  relatedRecord?: RoundSubmissionRelatedRecordAudit,
) {
  await audit.recordEvent({
    memberId,
    operation,
    reason: audit.reason.trim(),
    metadata: {
      event_scope: "round_excel_member_import",
      round: { id: roundId },
      file: {
        sha256: audit.file.sha256,
        size_bytes: audit.file.sizeBytes,
        extension: audit.file.extension,
      },
      row: { number: rowNumber },
      phase,
      write_stage: writeStage,
      service_write_performed: serviceWritePerformed,
      atomic_with_service_write: false,
      ...(relatedRecord ? { related_record: relatedRecord } : {}),
    },
  })
}

async function attemptCompensation(
  operation: () => Promise<void>,
  errors: unknown[],
) {
  try {
    await operation()
  } catch (error) {
    errors.push(error)
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function groupSubmissionsByMember(rows: unknown[]) {
  const grouped = new Map<string, Array<Record<string, unknown>>>()
  for (const value of rows) {
    const row = asRecord(value)
    const memberId = typeof row?.member_id === "string" ? row.member_id : null
    if (!row || !memberId) continue
    const current = grouped.get(memberId) ?? []
    current.push(row)
    grouped.set(memberId, current)
  }
  return grouped
}

const SUBMISSION_AUDIT_FIELDS = [
  "game_type_pref",
  "gender_pref",
  "availability",
  "interest_tags",
  "social_style",
  "message",
] as const

function stableComparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableComparable)
  const record = asRecord(value)
  if (!record) return value
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, stableComparable(record[key])]),
  )
}

function fieldSignature(rows: Array<Record<string, unknown>>, field: string) {
  return rows
    .map((row) => JSON.stringify(stableComparable(row[field])))
    .sort()
    .join("\n")
}

function submissionChangedFields(
  beforeRows: Array<Record<string, unknown>>,
  afterRows: Array<Record<string, unknown>>,
): RoundSubmissionRelatedRecordAudit["changed_fields"] {
  const changed: RoundSubmissionRelatedRecordAudit["changed_fields"] = []
  if ((beforeRows.length > 0) !== (afterRows.length > 0) || beforeRows.length !== afterRows.length) {
    changed.push("submission_presence")
  }
  for (const field of SUBMISSION_AUDIT_FIELDS) {
    if (fieldSignature(beforeRows, field) !== fieldSignature(afterRows, field)) {
      changed.push(field)
    }
  }
  return changed
}

async function recordSubmissionReplaceAudit(
  audit: RoundImportAuditOptions,
  roundId: string,
  memberId: string,
  rowNumber: number | null,
  phase: "apply" | "compensation",
  writeStage: "before_service_write" | "after_service_write" | "after_compensation",
  serviceWritePerformed: boolean,
  snapshotRole: RoundSubmissionRelatedRecordAudit["snapshot_role"],
  changedFields: RoundSubmissionRelatedRecordAudit["changed_fields"],
  compensationSucceeded?: boolean,
  compensationStep?: RoundSubmissionRelatedRecordAudit["compensation_step"],
) {
  await recordImportAudit(
    audit,
    roundId,
    memberId,
    "submission_replace",
    rowNumber,
    phase,
    writeStage,
    serviceWritePerformed,
    {
      entity: "match_round_submissions",
      operation: "round_replace",
      snapshot_role: snapshotRole,
      changed_fields: changedFields,
      ...(compensationStep === undefined
        ? {}
        : { compensation_step: compensationStep }),
      ...(compensationSucceeded === undefined
        ? {}
        : { compensation_succeeded: compensationSucceeded }),
    },
  )
}

async function nextTempNumber(db: SupabaseClient<any, any, any>, prefix: string): Promise<number> {
  const { data, error } = await db.from("members").select("member_number").like("member_number", `${prefix}%`)
  if (error) throw error
  return (data ?? []).reduce((max: number, row: any) => {
    const match = String(row.member_number ?? "").match(/-(\d+)$/)
    return Math.max(max, match ? Number(match[1]) : 0)
  }, 0) + 1
}

async function loadExistingTempBundle(
  db: SupabaseClient<any, any, any>,
  prefix: string,
) {
  const { data: members, error: memberError } = await db
    .from("members")
    .select("*")
    .like("member_number", `${prefix}%`)
  if (memberError) throw memberError

  const memberIds = (members ?? []).map((row: any) => row.id)
  if (memberIds.length === 0) {
    return {
      memberIds,
      members: [] as any[],
      memberIdentity: [] as any[],
      memberInterests: [] as any[],
      memberDynamicStats: [] as any[],
    }
  }

  const [memberIdentity, memberInterests, memberDynamicStats] = await Promise.all([
    db.from("member_identity").select("*").in("member_id", memberIds),
    db.from("member_interests").select("*").in("member_id", memberIds),
    db.from("member_dynamic_stats").select("*").in("member_id", memberIds),
  ])
  if (memberIdentity.error) throw memberIdentity.error
  if (memberInterests.error) throw memberInterests.error
  if (memberDynamicStats.error) throw memberDynamicStats.error

  return {
    memberIds,
    members: members ?? [],
    memberIdentity: memberIdentity.data ?? [],
    memberInterests: memberInterests.data ?? [],
    memberDynamicStats: memberDynamicStats.data ?? [],
  }
}

async function restoreExistingTempBundle(
  db: SupabaseClient<any, any, any>,
  bundle: Awaited<ReturnType<typeof loadExistingTempBundle>>,
  onMemberRowsRestored: (memberId: string) => Promise<void>,
) {
  if (bundle.members.length === 0) return
  const { error: memberError } = await db.from("members").insert(bundle.members)
  if (memberError) throw memberError
  for (const member of bundle.members) {
    await onMemberRowsRestored(String(member.id))
  }
  if (bundle.memberIdentity.length > 0) {
    const { error } = await db.from("member_identity").insert(bundle.memberIdentity)
    if (error) throw error
  }
  if (bundle.memberInterests.length > 0) {
    const { error } = await db.from("member_interests").insert(bundle.memberInterests)
    if (error) throw error
  }
  if (bundle.memberDynamicStats.length > 0) {
    const { error } = await db.from("member_dynamic_stats").insert(bundle.memberDynamicStats)
    if (error) throw error
  }
}

async function createTempMember(
  db: SupabaseClient<any, any, any>,
  roundPrefix: string,
  nextNumberValue: number,
  row: PreparedImportRow,
  roundId: string,
  audit: RoundImportAuditOptions,
): Promise<string> {
  const memberNumber = `${roundPrefix}${String(nextNumberValue).padStart(3, "0")}`
  const { data: member, error: memberError } = await db
    .from("members")
    .insert({
      member_number: memberNumber,
      membership_type: "player",
      status: "approved",
      account_status: "unbound",
      profile_stage: "complete",
      record_source: "import",
      onboarding_step: 0,
      attractiveness_score: normalizeLegacyCompatibilityScore(row.legacyProfile?.compatibility_score),
    })
    .select("id")
    .single()
  if (memberError) throw memberError

  const legacy = row.legacyProfile
  const memberId = member.id as string
  try {
    const { error: identityError } = await db.from("member_identity").insert({
      member_id: memberId,
      full_name: row.name,
      gender: legacy ? normalizeLegacyGender(legacy.gender) : (row.manualGender ?? "other"),
      age_range: "未填写",
      nationality: "未填写",
      current_city: "未填写",
      school_name: legacy?.school ?? null,
      department: legacy?.department ?? null,
      hobby_tags: legacy?.interest_tags ?? [],
      personality_self_tags: legacy?.social_tags ?? [],
    })
    if (identityError) throw identityError

    if (legacy) {
      const { error: interestError } = await db.from("member_interests").insert({
        member_id: memberId,
        scenario_mode_pref: legacy.game_mode ? [legacy.game_mode] : [],
      })
      if (interestError) throw interestError

      const { error: statsError } = await db.from("member_dynamic_stats").insert({
        member_id: memberId,
        activity_count: normalizeLegacySessionCount(legacy.session_count),
      })
      if (statsError) throw statsError
    }
  } catch (error) {
    const compensationErrors: unknown[] = []
    await attemptCompensation(
      () => recordImportAudit(
        audit,
        roundId,
        memberId,
        "delete",
        row.rowNumber,
        "compensation",
        "before_service_write",
        false,
      ),
      compensationErrors,
    )
    let deleted = false
    try {
      const { error: deleteError } = await db.from("members").delete().eq("id", memberId)
      if (deleteError) throw deleteError
      deleted = true
    } catch (deleteError) {
      compensationErrors.push(deleteError)
    }
    if (deleted) {
      await attemptCompensation(
        () => recordImportAudit(
          audit,
          roundId,
          memberId,
          "delete",
          row.rowNumber,
          "compensation",
          "after_service_write",
          true,
        ),
        compensationErrors,
      )
    } else {
      await attemptCompensation(
        () => recordImportAudit(
          audit,
          roundId,
          memberId,
          "restore",
          row.rowNumber,
          "compensation",
          "after_compensation",
          false,
        ),
        compensationErrors,
      )
    }
    throw withCompensationErrors(error, compensationErrors)
  }

  return memberId
}

function buildSummary(rows: ResolvedImportRow[]): ImportSummary {
  const warningCount = rows.reduce((sum, row) => sum + row.importMetadata.warnings.length, 0)
  return {
    totalRows: rows.length,
    currentCount: rows.filter((row) => row.source === "current").length,
    legacyCount: rows.filter((row) => row.source === "legacy-temp").length,
    tempCount: rows.filter((row) => row.source === "temp").length,
    warningCount,
  }
}

function assertNoDuplicateImports(rows: PreparedImportRow[]) {
  const seen = new Set<string>()
  for (const row of rows) {
    const key = row.existingMemberId ?? row.normalizedName
    if (seen.has(key)) {
      throw new Error(`导入数据存在重复成员：${row.name}`)
    }
    seen.add(key)
  }
}

function assertManualGenderSelections(rows: PreparedImportRow[]) {
  for (const row of rows) {
    if (row.source === "temp" && !row.manualGender) {
      throw new Error(`第 ${row.rowNumber} 行：未绑定老成员时必须手动选择本人性别`)
    }
  }
}

export async function importRoundWorkbook(
  roundId: string,
  buffer: Buffer,
  audit: RoundImportAuditOptions,
  legacyOverrides: LegacyOverrideMap = {},
  genderOverrides: GenderOverrideMap = {},
) {
  assertAuditOptions(audit)
  const { db, parsedRows, currentMembers, legacyMembers, existingSubs } = await loadRoundImportContext(roundId, buffer)
  const includeImportMetadata = await supportsImportMetadataColumn(db)
  const preparedRows = resolveImportRows(parsedRows, currentMembers, legacyMembers, legacyOverrides, genderOverrides)
  assertNoDuplicateImports(preparedRows)
  assertManualGenderSelections(preparedRows)
  const roundPrefix = `IMP-${roundId.slice(0, 8)}-`
  const existingTempBundle = await loadExistingTempBundle(db, roundPrefix)
  const createdMembers: CreatedImportMember[] = []
  const resolvedRows: ResolvedImportRow[] = []
  let tempCounter = await nextTempNumber(db, roundPrefix)
  let replaced = false
  let insertedNewSubmissions = false
  let deletedExistingTemp = false
  const existingDeleteIntentIds: string[] = []
  const submissionBeforeAttestedMemberIds: string[] = []
  let beforeSubmissionsByMember = new Map<string, Array<Record<string, unknown>>>()
  let afterSubmissionsByMember = new Map<string, Array<Record<string, unknown>>>()
  let submissionAffectedMemberIds: string[] = []
  let submissionRowNumberByMember = new Map<string, number>()

  try {
    for (const row of preparedRows) {
      const memberId = row.existingMemberId ?? await createTempMember(
        db,
        roundPrefix,
        tempCounter++,
        row,
        roundId,
        audit,
      )
      if (!row.existingMemberId) {
        createdMembers.push({ memberId, rowNumber: row.rowNumber })
        await recordImportAudit(
          audit,
          roundId,
          memberId,
          "create",
          row.rowNumber,
          "apply",
          "after_service_write",
          true,
        )
      }
      resolvedRows.push({ ...row, memberId, source: row.source })
    }

    const inserts = resolvedRows.map((row) => ({
      round_id: roundId,
      member_id: row.memberId,
      game_type_pref: row.gameTypePref,
      gender_pref: row.genderPref,
      availability: row.availability,
      interest_tags: [],
      social_style: null,
      message: row.message,
      ...(includeImportMetadata ? { import_metadata: row.importMetadata } : {}),
    }))
    beforeSubmissionsByMember = groupSubmissionsByMember(existingSubs)
    afterSubmissionsByMember = groupSubmissionsByMember(inserts)
    submissionRowNumberByMember = new Map(
      resolvedRows.map((row) => [row.memberId, row.rowNumber]),
    )
    submissionAffectedMemberIds = Array.from(new Set([
      ...beforeSubmissionsByMember.keys(),
      ...afterSubmissionsByMember.keys(),
    ]))

    for (const memberId of submissionAffectedMemberIds) {
      const beforeRows = beforeSubmissionsByMember.get(memberId) ?? []
      const afterRows = afterSubmissionsByMember.get(memberId) ?? []
      await recordSubmissionReplaceAudit(
        audit,
        roundId,
        memberId,
        submissionRowNumberByMember.get(memberId) ?? null,
        "apply",
        "before_service_write",
        false,
        "before",
        submissionChangedFields(beforeRows, afterRows),
      )
      submissionBeforeAttestedMemberIds.push(memberId)
    }

    const { error: deleteError } = await db.from("match_round_submissions").delete().eq("round_id", roundId)
    if (deleteError) throw deleteError
    replaced = true

    if (existingTempBundle.memberIds.length > 0) {
      for (const memberId of existingTempBundle.memberIds) {
        await recordImportAudit(
          audit,
          roundId,
          String(memberId),
          "delete",
          null,
          "apply",
          "before_service_write",
          false,
        )
        existingDeleteIntentIds.push(String(memberId))
      }
      const { error: tempDeleteError } = await db.from("members").delete().in("id", existingTempBundle.memberIds)
      if (tempDeleteError) throw tempDeleteError
      deletedExistingTemp = true
      for (const memberId of existingTempBundle.memberIds) {
        await recordImportAudit(
          audit,
          roundId,
          String(memberId),
          "delete",
          null,
          "apply",
          "after_service_write",
          true,
        )
      }
    }

    const { error: insertError } = await (db as any).from("match_round_submissions").insert(inserts)
    if (insertError) throw insertError
    insertedNewSubmissions = true
    for (const memberId of submissionAffectedMemberIds) {
      const beforeRows = beforeSubmissionsByMember.get(memberId) ?? []
      const afterRows = afterSubmissionsByMember.get(memberId) ?? []
      await recordSubmissionReplaceAudit(
        audit,
        roundId,
        memberId,
        submissionRowNumberByMember.get(memberId) ?? null,
        "apply",
        "after_service_write",
        true,
        "after",
        submissionChangedFields(beforeRows, afterRows),
      )
    }
  } catch (error) {
    const compensationErrors: unknown[] = []
    if (deletedExistingTemp) {
      try {
        await restoreExistingTempBundle(db, existingTempBundle, async (memberId) => {
          await attemptCompensation(
            () => recordImportAudit(
              audit,
              roundId,
              memberId,
              "restore",
              null,
              "compensation",
              "after_compensation",
              true,
            ),
            compensationErrors,
          )
        })
      } catch (restoreError) {
        compensationErrors.push(restoreError)
      }
    } else if (existingDeleteIntentIds.length > 0) {
      for (const memberId of existingDeleteIntentIds) {
        await attemptCompensation(
          () => recordImportAudit(
            audit,
            roundId,
            memberId,
            "restore",
            null,
            "compensation",
            "after_compensation",
            false,
          ),
          compensationErrors,
        )
      }
    }
    let submissionClearSucceeded = !replaced
    if (replaced) {
      try {
        const { error: clearSubmissionError } = await db
          .from("match_round_submissions")
          .delete()
          .eq("round_id", roundId)
        if (clearSubmissionError) throw clearSubmissionError
        submissionClearSucceeded = true
      } catch (clearSubmissionError) {
        compensationErrors.push(clearSubmissionError)
        submissionClearSucceeded = false
      }
      for (const memberId of submissionBeforeAttestedMemberIds) {
        const currentRows = insertedNewSubmissions
          ? afterSubmissionsByMember.get(memberId) ?? []
          : []
        await attemptCompensation(
          () => recordSubmissionReplaceAudit(
            audit,
            roundId,
            memberId,
            submissionRowNumberByMember.get(memberId) ?? null,
            "compensation",
            "after_compensation",
            submissionClearSucceeded,
            "after_compensation_clear",
            submissionClearSucceeded
              ? submissionChangedFields(currentRows, [])
              : submissionChangedFields(
                beforeSubmissionsByMember.get(memberId) ?? [],
                afterSubmissionsByMember.get(memberId) ?? [],
              ),
            submissionClearSucceeded,
            "clear_current",
          ),
          compensationErrors,
        )
      }
    }

    let submissionCompensationSucceeded = submissionClearSucceeded
    if (replaced && submissionClearSucceeded && existingSubs.length > 0) {
      try {
        const { error: restoreSubmissionError } = await (db as any)
          .from("match_round_submissions")
          .insert(existingSubs)
        if (restoreSubmissionError) throw restoreSubmissionError
        submissionCompensationSucceeded = true
      } catch (restoreSubmissionError) {
        compensationErrors.push(restoreSubmissionError)
        submissionCompensationSucceeded = false
      }
    }
    for (const memberId of submissionBeforeAttestedMemberIds) {
      const beforeRows = beforeSubmissionsByMember.get(memberId) ?? []
      const afterRows = afterSubmissionsByMember.get(memberId) ?? []
      await attemptCompensation(
        () => recordSubmissionReplaceAudit(
          audit,
          roundId,
          memberId,
          submissionRowNumberByMember.get(memberId) ?? null,
          "compensation",
          "after_compensation",
          replaced,
          "after_compensation",
          submissionCompensationSucceeded
            ? []
            : submissionChangedFields(beforeRows, afterRows),
          submissionCompensationSucceeded,
          "restore_previous",
        ),
        compensationErrors,
      )
    }
    if (createdMembers.length > 0) {
      for (const created of createdMembers) {
        await attemptCompensation(
          () => recordImportAudit(
            audit,
            roundId,
            created.memberId,
            "delete",
            created.rowNumber,
            "compensation",
            "before_service_write",
            false,
          ),
          compensationErrors,
        )
      }
      let deletedCreatedMembers = false
      try {
        const { error: deleteCreatedError } = await db
          .from("members")
          .delete()
          .in("id", createdMembers.map((member) => member.memberId))
        if (deleteCreatedError) throw deleteCreatedError
        deletedCreatedMembers = true
      } catch (deleteCreatedError) {
        compensationErrors.push(deleteCreatedError)
      }
      if (deletedCreatedMembers) {
        for (const created of createdMembers) {
          await attemptCompensation(
            () => recordImportAudit(
              audit,
              roundId,
              created.memberId,
              "delete",
              created.rowNumber,
              "compensation",
              "after_service_write",
              true,
            ),
            compensationErrors,
          )
        }
      } else {
        for (const created of createdMembers) {
          await attemptCompensation(
            () => recordImportAudit(
              audit,
              roundId,
              created.memberId,
              "restore",
              created.rowNumber,
              "compensation",
              "after_compensation",
              false,
            ),
            compensationErrors,
          )
        }
      }
    }
    throw withCompensationErrors(error, compensationErrors)
  }

  return { rows: resolvedRows, summary: buildSummary(resolvedRows) }
}
