"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMatchHistory } from "@/lib/queries/match-history"
import { fetchPairRelations } from "@/lib/queries/pair-relations-build"
import { submissionToCandidate } from "@/lib/matching/adapter-submission"
import { runFullMatching } from "@/lib/matching/run-matching"
import { DEFAULT_CONFIG } from "@/lib/matching/config"
import type { Json } from "@/types/database.types"

/** 获取被拆散且未重新配对的成员 ID 列表 */
async function fetchCancelledMemberIds(sessionId: string) {
  const supabase = await createClient()

  // 1. 获取所有被取消的成员（含多人组 group_members）
  const { data: cancelled, error } = await supabase
    .from("match_results")
    .select("member_a_id, member_b_id, group_members")
    .eq("session_id", sessionId)
    .eq("status", "cancelled")

  if (error) throw error
  const ids = new Set<string>()
  for (const row of cancelled ?? []) {
    if (row.member_a_id) ids.add(row.member_a_id)
    if (row.member_b_id) ids.add(row.member_b_id)
    if (Array.isArray(row.group_members)) {
      for (const gm of row.group_members) ids.add(gm as string)
    }
  }

  // 2. 排除已通过手动配对或其他方式重新配上的成员
  const { data: active } = await supabase
    .from("match_results")
    .select("member_a_id, member_b_id, group_members")
    .eq("session_id", sessionId)
    .neq("status", "cancelled")

  const matched = new Set<string>()
  for (const row of active ?? []) {
    if (row.member_a_id) matched.add(row.member_a_id)
    if (row.member_b_id) matched.add(row.member_b_id)
    if (Array.isArray(row.group_members)) {
      for (const gm of row.group_members) matched.add(gm as string)
    }
  }

  return [...ids].filter((id) => !matched.has(id))
}

/** 获取成员完整资料（含子表） */
async function fetchMemberProfiles(memberIds: string[]) {
  if (memberIds.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("members")
    .select(`
      id, member_number, status, attractiveness_score, membership_type,
      member_identity (*),
      member_interests (*),
      member_personality (*),
      member_language (*),
      member_boundaries (*),
      member_dynamic_stats (activity_count, late_count, no_show_count, replay_willing_rate, reliability_score),
      personality_quiz_results (score_e, score_a, score_o, score_c, score_n)
    `)
    .in("id", memberIds)

  if (error) throw error
  return data ?? []
}

/** 获取某轮次中指定成员的问卷提交 */
async function fetchSubmissions(roundId: string, memberIds: string[]) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("match_round_submissions")
    .select("*")
    .eq("round_id", roundId)
    .in("member_id", memberIds)
  return data ?? []
}

/** 对取消池成员重新运行匹配算法 */
export async function runPoolRematch(sessionId: string) {
  await requireAdmin()

  // 1. 获取已取消的成员 ID
  const memberIds = await fetchCancelledMemberIds(sessionId)
  if (memberIds.length < 2) {
    return { error: "池中至少需要 2 人才能匹配" }
  }

  // 2. 获取 session 的 round_id（必须有轮次才能获取问卷）
  const supabase = await createClient()
  const { data: session } = await supabase
    .from("match_sessions")
    .select("round_id")
    .eq("id", sessionId)
    .single()
  const roundId = session?.round_id
  if (!roundId) {
    return { error: "该匹配会话无关联轮次，无法获取问卷数据" }
  }

  // 3. 获取完整资料
  const members = await fetchMemberProfiles(memberIds)

  // 4. 获取匹配历史
  const historyMap = await fetchMatchHistory(memberIds)

  // 5. 构建 MatchCandidate（从问卷读取本轮偏好）
  const submissions = await fetchSubmissions(roundId, memberIds)
  const subMap = new Map(submissions.map((s) => [s.member_id, s]))
  const candidates = members.map((m) => {
    const history = historyMap.get(m.id) ?? []
    const sub = subMap.get(m.id)
    if (!sub) throw new Error(`成员 ${m.id} 未提交本轮问卷`)
    return submissionToCandidate(sub, m, history)
  })

  // 6. 构建 pairRelations
  const pairRelations = await fetchPairRelations(memberIds)

  // 7. 运行匹配
  const config = { ...DEFAULT_CONFIG }
  const idMap = new Map<string, string>()
  for (const m of members) idMap.set(m.id, m.id)

  const result = runFullMatching(candidates, config, idMap, pairRelations)

  // 8. 写入新 match_results
  const rows = result.rows.map((r) => ({
    session_id: sessionId,
    member_a_id: r.member_a_id,
    member_b_id: r.member_b_id,
    group_members: r.group_members,
    total_score: r.total_score,
    score_breakdown: r.score_breakdown as Json,
    rank: r.rank,
    best_slot: r.best_slot,
    status: "draft",
  }))

  if (rows.length > 0) {
    const { error } = await supabase.from("match_results").insert(rows)
    if (error) {
      console.error("[runPoolRematch]", error)
      return { error: "操作失败" }
    }
  }

  revalidatePath(`/admin/matching/${sessionId}`)
  return { success: true, matchCount: result.rows.length }
}
