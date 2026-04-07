"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchRoundSubmissions } from "@/lib/queries/rounds"
import { fetchMatchHistory } from "@/lib/queries/matching"
import { submissionToCandidate } from "@/lib/matching/adapter"
import { runDuoMatching } from "@/lib/matching"
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

  // 4. 运行匹配算法
  const config: MatchingConfig = { ...DEFAULT_CONFIG }
  const result = runDuoMatching(candidates, config)

  // 5. 保存 match_session（关联 round_id）
  const { data: session, error: sErr } = await supabase
    .from("match_sessions")
    .insert({
      session_name: sessionName || `${new Date().toLocaleDateString("zh-CN")} 匹配`,
      round_id: roundId,
      algorithm: result.metadata.algorithmUsed,
      config: config as unknown as import("@/types/database.types").Json,
      total_candidates: result.metadata.candidateCount,
      total_matched: result.pairs.length * 2,
      total_unmatched: result.unmatched.length,
      created_by: admin.id,
    })
    .select("id")
    .single()

  if (sErr) return { error: sErr.message }

  // 6. 保存 match_results — 用 submissionId 映射回 member_id
  const subIdToMemberId = new Map<string, string>()
  for (const sub of submissions) {
    subIdToMemberId.set(sub.id, sub.member_id)
  }

  const rows = result.pairs.map((pair) => {
    const aId = subIdToMemberId.get(pair.userA)
    const bId = subIdToMemberId.get(pair.userB)
    if (!aId || !bId) throw new Error(`找不到 member_id: ${pair.userA} / ${pair.userB}`)
    return {
      session_id: session.id,
      member_a_id: aId,
      member_b_id: bId,
      total_score: pair.score.totalScore,
      score_breakdown: pair.score.breakdown as unknown as import("@/types/database.types").Json,
      rank: pair.rank,
    }
  })

  if (rows.length > 0) {
    const { error: rErr } = await supabase.from("match_results").insert(rows)
    if (rErr) return { error: rErr.message }
  }

  // 7. 更新轮次状态为 matched
  await supabase.from("match_rounds").update({ status: "matched" }).eq("id", roundId)

  return { success: true, sessionId: session.id }
}
