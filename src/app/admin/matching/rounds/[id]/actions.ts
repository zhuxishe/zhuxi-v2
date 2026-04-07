"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchRoundSubmissions } from "@/lib/queries/rounds"
import { fetchMatchHistory } from "@/lib/queries/matching"
import { submissionToCandidate } from "@/lib/matching/adapter"
import { runFullMatching } from "@/lib/matching/run-matching"
import { DEFAULT_CONFIG } from "@/lib/matching/config"
import type { MatchingConfig } from "@/lib/matching/types"

/** 更新轮次状态 */
export async function updateRoundStatus(roundId: string, status: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from("match_rounds")
    .update({ status })
    .eq("id", roundId)

  if (error) return { error: error.message }
  return { success: true }
}

/** 基于轮次问卷运行匹配 */
export async function runRoundMatching(roundId: string, sessionName: string) {
  const admin = await requireAdmin()
  const supabase = await createClient()

  // 1. 获取问卷提交（含用户资料）
  const submissions = await fetchRoundSubmissions(roundId)
  if (submissions.length < 2) {
    return { error: "至少需要 2 人提交问卷才能匹配" }
  }

  // 2. 获取匹配历史，并将 partnerId 转为 submissionId
  const memberIds = submissions.map((s) => s.member_id)
  const historyMap = await fetchMatchHistory(memberIds)

  // 建立 memberId → submissionId 映射（用于历史中的 partnerId 转换）
  const memberToSubId = new Map<string, string>()
  for (const sub of submissions) memberToSubId.set(sub.member_id, sub.id)

  // 3. 转换为 MatchCandidate（从 submission 读取本轮偏好）
  const candidates = submissions.map((sub) => {
    const member = Array.isArray(sub.member) ? sub.member[0] : sub.member
    const rawHistory = historyMap.get(sub.member_id) ?? []
    // 将 partnerId 转为 submissionId，使 scorer 能正确查找
    const history = rawHistory.map((h) => ({
      name: memberToSubId.get(h.name) ?? h.name,
      count: h.count,
    }))
    return submissionToCandidate(sub, member, history)
  })

  // 4. 三阶段分流匹配（双人池 → 多人池 → 回流兜底）
  const config: MatchingConfig = { ...DEFAULT_CONFIG }
  const subIdToMemberId = new Map<string, string>()
  for (const sub of submissions) subIdToMemberId.set(sub.id, sub.member_id)

  const result = runFullMatching(candidates, config, subIdToMemberId)

  // 5. 保存 match_session
  const { data: session, error: sErr } = await supabase
    .from("match_sessions")
    .insert({
      session_name: sessionName || `${new Date().toLocaleDateString("zh-CN")} 匹配`,
      round_id: roundId,
      algorithm: "max_coverage_split",
      config: config as unknown as import("@/types/database.types").Json,
      total_candidates: result.totalCandidates,
      total_matched: result.totalMatched,
      total_unmatched: result.totalUnmatched,
      created_by: admin.id,
    })
    .select("id")
    .single()

  if (sErr) return { error: sErr.message }

  // 6. 保存 match_results
  const rows = result.rows.map((r) => ({
    session_id: session.id,
    member_a_id: r.member_a_id,
    member_b_id: r.member_b_id,
    group_members: r.group_members,
    total_score: r.total_score,
    score_breakdown: r.score_breakdown as import("@/types/database.types").Json,
    rank: r.rank,
    best_slot: r.best_slot,
  }))

  if (rows.length > 0) {
    const { error: rErr } = await supabase.from("match_results").insert(rows)
    if (rErr) return { error: rErr.message }
  }

  // 7. 更新轮次状态为 matched
  await supabase.from("match_rounds").update({ status: "matched" }).eq("id", roundId)

  return { success: true, sessionId: session.id }
}
