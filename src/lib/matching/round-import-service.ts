import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeLegacyGender } from "./round-import-utils"
import { supportsImportMetadataColumn } from "./import-metadata-column"
import { parseRoundImportWorkbook } from "./round-import-parser"
import { resolveImportRows } from "./round-import-resolver"
import type {
  CurrentImportMember,
  ImportSummary,
  LegacyImportMember,
  PreparedImportRow,
  ResolvedImportRow,
} from "./round-import-types"

async function fetchCurrentImportMembers(db: SupabaseClient<any, any, any>): Promise<CurrentImportMember[]> {
  const { data, error } = await db
    .from("members")
    .select("id, member_identity(full_name, nickname)")
    .eq("membership_type", "player")
  if (error) throw error
  return (data ?? []).map((row: any) => {
    const identity = Array.isArray(row.member_identity) ? row.member_identity[0] : row.member_identity
    return { id: row.id, full_name: identity?.full_name ?? null, nickname: identity?.nickname ?? null }
  })
}

async function fetchLegacyImportMembers(db: SupabaseClient<any, any, any>): Promise<LegacyImportMember[]> {
  const { data, error } = await (db as any).from("legacy_members").select("*")
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    legacy_id: row.id,
    full_name: row.full_name,
    gender: row.gender ?? null,
    school: row.school ?? null,
    department: row.department ?? null,
    interest_tags: row.interest_tags ?? [],
    social_tags: row.social_tags ?? [],
    game_mode: row.game_mode ?? null,
    compatibility_score: row.compatibility_score ?? null,
    session_count: row.session_count ?? null,
    match_history: row.match_history ?? [],
  }))
}

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
      attractiveness_score: row.legacyProfile?.compatibility_score ?? null,
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
        activity_count: legacy.session_count ?? 0,
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

export async function importRoundWorkbook(roundId: string, buffer: Buffer) {
  const db = createAdminClient() as SupabaseClient<any, any, any>
  const { data: round, error: roundError } = await db
    .from("match_rounds")
    .select("id, status, activity_start, activity_end")
    .eq("id", roundId)
    .single()
  if (roundError || !round) throw new Error("轮次不存在")
  if (round.status === "matched") throw new Error("该轮次已完成匹配，禁止导入 Excel")

  const includeImportMetadata = await supportsImportMetadataColumn(db)
  const parsedRows = parseRoundImportWorkbook(buffer, round.activity_start, round.activity_end)
  const [currentMembers, legacyMembers, existingSubs] = await Promise.all([
    fetchCurrentImportMembers(db),
    fetchLegacyImportMembers(db),
    db.from("match_round_submissions").select("*").eq("round_id", roundId),
  ])
  if (existingSubs.error) throw existingSubs.error

  const preparedRows = resolveImportRows(parsedRows, currentMembers, legacyMembers)
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
    if (replaced && (existingSubs.data?.length ?? 0) > 0) {
      await (db as any).from("match_round_submissions").insert(existingSubs.data ?? [])
    }
    if (createdMemberIds.length > 0) await db.from("members").delete().in("id", createdMemberIds)
    throw error
  }

  return { rows: resolvedRows, summary: buildSummary(resolvedRows) }
}
