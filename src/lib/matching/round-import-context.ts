import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  normalizeLegacyCompatibilityScore,
  normalizeLegacySessionCount,
} from "./legacy-import-normalize"
import { parseRoundImportWorkbook } from "./round-import-parser"
import type { CurrentImportMember, LegacyImportMember, ParsedImportRow } from "./round-import-types"

export async function fetchCurrentImportMembers(db: SupabaseClient<any, any, any>): Promise<CurrentImportMember[]> {
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

export async function fetchLegacyImportMembers(db: SupabaseClient<any, any, any>): Promise<LegacyImportMember[]> {
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
    compatibility_score: normalizeLegacyCompatibilityScore(row.compatibility_score),
    session_count: normalizeLegacySessionCount(row.session_count),
    match_history: row.match_history ?? [],
  }))
}

export async function loadRoundImportContext(roundId: string, buffer: Buffer): Promise<{
  db: SupabaseClient<any, any, any>
  parsedRows: ParsedImportRow[]
  currentMembers: CurrentImportMember[]
  legacyMembers: LegacyImportMember[]
  existingSubs: any[]
}> {
  const db = createAdminClient() as SupabaseClient<any, any, any>
  const { data: round, error: roundError } = await db
    .from("match_rounds")
    .select("id, status, activity_start, activity_end")
    .eq("id", roundId)
    .single()
  if (roundError || !round) throw new Error("轮次不存在")
  if (round.status === "matched") throw new Error("该轮次已完成匹配，禁止导入 Excel")

  const parsedRows = parseRoundImportWorkbook(buffer, round.activity_start, round.activity_end)
  const [currentMembers, legacyMembers, existingSubs] = await Promise.all([
    fetchCurrentImportMembers(db),
    fetchLegacyImportMembers(db),
    db.from("match_round_submissions").select("*").eq("round_id", roundId),
  ])
  if (existingSubs.error) throw existingSubs.error

  return {
    db,
    parsedRows,
    currentMembers,
    legacyMembers,
    existingSubs: existingSubs.data ?? [],
  }
}
