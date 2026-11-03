import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchPlayerRounds } from "./player-rounds"
import { isRoundSetupError } from "@/lib/matching/round-config"
import { summarizeRoundStats, type RoundStats } from "@/lib/matching/round-stats"

/** 获取所有匹配轮次 */
export async function fetchRounds() {
  await requireAdmin()
  const supabase = await createClient()
  let { data, error } = await supabase
    .from("match_rounds")
    .select("id, round_name, status, survey_start, survey_end, activity_start, activity_end, purpose")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100)
  if (isRoundSetupError(error)) {
    const legacy = await supabase.from("match_rounds")
      .select("id, round_name, status, survey_start, survey_end, activity_start, activity_end")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(100)
    data = legacy.data?.map((round) => ({ ...round, purpose: "matching" })) ?? null
    error = legacy.error
  }
  if (error) throw error
  return data ?? []
}

/** 获取单个轮次详情 */
export async function fetchRound(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("match_rounds")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single()

  if (error) throw error
  return data
}

export async function fetchRoundHasSession(roundId: string): Promise<boolean> {
  await requireAdmin()
  const db = await createClient()
  const { data, error } = await db.from("match_sessions").select("id").eq("round_id", roundId).limit(1).maybeSingle()
  if (error) throw error
  return Boolean(data)
}

/** 获取某轮次的所有问卷提交 */
export async function fetchRoundSubmissions(roundId: string) {
  const admin = await requireAdmin()
  const supabase = createAdminClient()
  const columns = admin.role === "super_admin"
    ? `
      id, round_id, member_id, game_type_pref, gender_pref, availability,
      interest_tags, social_style, message, created_at, updated_at, cancelled_at,
      member:members (
        id, member_number,
        member_identity (full_name, nickname, school_name)
      )
    `
    : `
      id, round_id, member_id, created_at, updated_at, cancelled_at,
      member:members (
        id,
        member_identity (full_name, nickname, school_name)
      )
    `
  const query = (select: string) => supabase
    .from("match_round_submissions")
    .select(select)
    .eq("round_id", roundId)
    .order("created_at", { ascending: false })
    .limit(500)
  let { data, error } = await query(admin.role === "super_admin" ? `${columns}, custom_answers` : columns)
  if (admin.role === "super_admin" && isRoundSetupError(error)) ({ data, error } = await query(columns))
  if (error) throw error
  return data ?? []
}

/** 获取某轮次的问卷统计；本人性别与搭档倾向只返回聚合，不返回个人资料。 */
export async function fetchRoundStats(roundId: string): Promise<RoundStats> {
  await requireAdmin()
  const supabase = createAdminClient()
  const { data: submissions, error } = await supabase
    .from("match_round_submissions")
    .select("game_type_pref, gender_pref, availability, member:members(member_identity(gender))")
    .eq("round_id", roundId)
    .is("cancelled_at", null)
    .limit(500)

  if (error) throw error
  return summarizeRoundStats(submissions ?? [])
}

/** 获取当前 open 的轮次（玩家端用） */
export async function fetchOpenRound(now = new Date()) {
  const rounds = await fetchPlayerRounds(now)
  return rounds[0] ?? null
}

/** 获取最新轮次（不限状态，用于非 open 时展示状态提示） */
export async function fetchLatestRound() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("match_rounds")
    .select("id, round_name, status, survey_start, survey_end")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return data
}

/** 获取玩家在某轮次的提交 */
export async function fetchMySubmission(roundId: string, memberId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("match_round_submissions")
    .select("*")
    .eq("round_id", roundId)
    .eq("member_id", memberId)
    .maybeSingle()

  if (error) throw error
  return data
}
