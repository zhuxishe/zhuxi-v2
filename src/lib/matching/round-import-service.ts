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
  ImportSummary,
  LegacyOverrideMap,
  PreparedImportRow,
  ResolvedImportRow,
} from "./round-import-types"

async function nextTempNumber(db: SupabaseClient<any, any, any>, prefix: string): Promise<number> {
  const { data, error } = await db.from("members").select("member_number").like("member_number", `${prefix}%`)
  if (error) throw error
  return (data ?? []).reduce((max: number, row: any) => {
    const match = String(row.member_number ?? "").match(/-(\d+)$/)
    return Math.max(max, match ? Number(match[1]) : 0)
  }, 0) + 1
}

async function createTempMember(
  db: SupabaseClient<any, any, any>,
  roundPrefix: string,
  nextNumberValue: number,
  row: PreparedImportRow,
): Promise<string> {
  const memberNumber = `${roundPrefix}${String(nextNumberValue).padStart(3, "0")}`
  const { data: member, error: memberError } = await db
    .from("members")
    .insert({
      member_number: memberNumber,
      membership_type: "player",
      status: "approved",
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
      gender: normalizeLegacyGender(legacy?.gender),
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
    await db.from("members").delete().eq("id", memberId)
    throw error
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

export async function importRoundWorkbook(
  roundId: string,
  buffer: Buffer,
  legacyOverrides: LegacyOverrideMap = {},
) {
  const { db, parsedRows, currentMembers, legacyMembers, existingSubs } = await loadRoundImportContext(roundId, buffer)
  const includeImportMetadata = await supportsImportMetadataColumn(db)
  const preparedRows = resolveImportRows(parsedRows, currentMembers, legacyMembers, legacyOverrides)
  assertNoDuplicateImports(preparedRows)
  const roundPrefix = `IMP-${roundId.slice(0, 8)}-`
  const createdMemberIds: string[] = []
  const resolvedRows: ResolvedImportRow[] = []
  let tempCounter = await nextTempNumber(db, roundPrefix)
  let replaced = false

  try {
    for (const row of preparedRows) {
      const memberId = row.existingMemberId ?? await createTempMember(db, roundPrefix, tempCounter++, row)
      if (!row.existingMemberId) createdMemberIds.push(memberId)
      resolvedRows.push({ ...row, memberId, source: row.source })
    }

    const { error: deleteError } = await db.from("match_round_submissions").delete().eq("round_id", roundId)
    if (deleteError) throw deleteError
    replaced = true

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
    const { error: insertError } = await (db as any).from("match_round_submissions").insert(inserts)
    if (insertError) throw insertError
  } catch (error) {
    if (replaced && existingSubs.length > 0) {
      await (db as any).from("match_round_submissions").insert(existingSubs)
    }
    if (createdMemberIds.length > 0) await db.from("members").delete().in("id", createdMemberIds)
    throw error
  }

  return { rows: resolvedRows, summary: buildSummary(resolvedRows) }
}
