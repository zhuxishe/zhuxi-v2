import { createClient } from "@/lib/supabase/server"

/** 获取所有匹配轮次 */
export async function fetchRounds() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("match_rounds")
    .select("*")
    .order("created_at", { ascending: false })

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

/** 获取某轮次的所有问卷提交 */
export async function fetchRoundSubmissions(roundId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("match_round_submissions")
    .select(`
      *,
      member:members (
        id, member_number, status, attractiveness_score,
        member_identity (*),
        member_personality (warmup_speed, expression_style_tags, group_role_tags),
        member_interests (*),
        member_language (*),
        member_boundaries (*),
        member_dynamic_stats (*),
        personality_quiz_results (score_e, score_a, score_o, score_c, score_n)
      )
    `)
    .eq("round_id", roundId)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data ?? []
}

/** 获取某轮次的问卷统计 */
export async function fetchRoundStats(roundId: string) {
  const submissions = await fetchRoundSubmissions(roundId)

  const total = submissions.length
  const duoCount = submissions.filter((s) => s.game_type_pref === "双人").length
  const multiCount = submissions.filter((s) => s.game_type_pref === "多人").length
  const eitherCount = submissions.filter((s) => s.game_type_pref === "都可以").length

  // 时段热力图
  const slotCounts: Record<string, number> = {}
  for (const sub of submissions) {
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
export async function fetchOpenRound() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("match_rounds")
    .select("*")
    .eq("status", "open")
    .order("survey_end", { ascending: true })
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
