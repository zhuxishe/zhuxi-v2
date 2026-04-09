"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMatchHistory } from "@/lib/queries/matching"
import { fetchPairRelations } from "@/lib/queries/pair-relations-build"
import { toMatchCandidate } from "@/lib/matching/adapter"
import { runFullMatching } from "@/lib/matching/run-matching"
import { DEFAULT_CONFIG } from "@/lib/matching/config"
import type { Json } from "@/types/database.types"

/** 获取被拆散的成员 ID 列表 */
async function fetchCancelledMemberIds(sessionId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("match_results")
    .select("member_a_id, member_b_id")
    .eq("session_id", sessionId)
    .eq("status", "cancelled")

  if (error) throw error
  const ids = new Set<string>()
  for (const row of data ?? []) {
    if (row.member_a_id) ids.add(row.member_a_id)
    if (row.member_b_id) ids.add(row.member_b_id)
  }
  return [...ids]
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

/** 对取消池成员重新运行匹配算法 */
export async function runPoolRematch(sessionId: string) {
  const admin = await requireAdmin()

  // 1. 获取已取消的成员 ID
  const memberIds = await fetchCancelledMemberIds(sessionId)
  if (memberIds.length < 2) {
    return { error: "池中至少需要 2 人才能匹配" }
  }

  // 2. 获取完整资料
  const members = await fetchMemberProfiles(memberIds)

  // 3. 获取匹配历史
  const historyMap = await fetchMatchHistory(memberIds)

  // 4. 构建 MatchCandidate
  const candidates = members.map((m) => {
    const history = historyMap.get(m.id) ?? []
    return toMatchCandidate(m, history)
  })

  // 5. 构建 pairRelations
  const idToName = new Map<string, string>()
  for (const c of candidates) {
    const memberId = members.find((m) => m.id === c.submissionId)?.id
    if (memberId) idToName.set(memberId, c.name)
  }
  const pairRelations = await fetchPairRelations(memberIds, idToName)

  // 6. 运行匹配
  const config = { ...DEFAULT_CONFIG }
  const idMap = new Map<string, string>()
  for (const m of members) idMap.set(m.id, m.id) // submissionId = memberId

  const result = runFullMatching(candidates, config, idMap, pairRelations)

  // 7. 写入新 match_results
  const supabase = await createClient()
  const rows = result.rows.map((r) => ({
    session_id: sessionId,
    member_a_id: r.member_a_id,
    member_b_id: r.member_b_id,
    group_members: r.group_members,
    total_score: r.total_score,
    score_breakdown: r.score_breakdown as Json,
    rank: r.rank,
    best_slot: r.best_slot,
    game_type: `再匹配-${r.game_type}`,
    status: "draft",
    created_by: admin.id,
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
