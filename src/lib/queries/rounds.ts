import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/auth/admin"
import { getSurveyWindowState } from "@/lib/matching/survey-window"
import { isRoundSetupError } from "@/lib/matching/round-config"

/** 获取所有匹配轮次 */
export async function fetchRounds() {
  await requireAdmin()
  const supabase = await createClient()
  let { data, error } = await supabase
    .from("match_rounds")
    .select("id, round_name, status, survey_start, survey_end, activity_start, activity_end, purpose")
    .order("created_at", { ascending: false })
    .limit(100)
  if (isRoundSetupError(error)) {
    const legacy = await supabase.from("match_rounds")
      .select("id, round_name, status, survey_start, survey_end, activity_start, activity_end")
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
        id,
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

/** 获取某轮次的问卷统计（轻量查询，仅读 game_type_pref + availability） */
export async function fetchRoundStats(roundId: string) {
  await requireAdmin()
  const supabase = createAdminClient()
  const { data: submissions, error } = await supabase
    .from("match_round_submissions")
    .select("game_type_pref, availability")
    .eq("round_id", roundId)
    .is("cancelled_at", null)
    .limit(500)

  if (error) throw error
  const total = (submissions ?? []).length
  const list = submissions ?? []
  const duoCount = list.filter((s) => s.game_type_pref === "双人").length
  const multiCount = list.filter((s) => s.game_type_pref === "多人").length
  const eitherCount = list.filter((s) => s.game_type_pref === "都可以").length

  // 时段热力图
  const slotCounts: Record<string, number> = {}
  for (const sub of list) {
    const avail = sub.availability as Record<string, string[]>
    for (const [date, slots] of Object.entries(avail)) {
      for (const slot of slots) {
        const key = `${date}_${slot}`
        slotCounts[key] = (slotCounts[key] ?? 0) + 1
      }
    }
  }

  return {
    total,
    gameTypeDist: { duo: duoCount, multi: multiCount, either: eitherCount },
    slotCounts,
  }
}

/** 获取当前 open 的轮次（玩家端用） */
export async function fetchOpenRound(now = new Date()) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("match_rounds")
    .select("*")
    .eq("status", "open")
    .lte("survey_start", now.toISOString())
    .gt("survey_end", now.toISOString())
    .order("survey_end", { ascending: true })
    .limit(1)
    .maybeSingle()

  return data && getSurveyWindowState(data, now) === "open" ? data : null
}

/** 获取最新轮次（不限状态，用于非 open 时展示状态提示） */
export async function fetchLatestRound() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("match_rounds")
    .select("id, round_name, status, survey_start, survey_end")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return data
}

/** 获取玩家在某轮次的提交 */
export async function fetchMySubmission(roundId: string, memberId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("match_round_submissions")
    .select("*")
    .eq("round_id", roundId)
    .eq("member_id", memberId)
    .maybeSingle()

  return data
}
