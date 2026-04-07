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

  // 2. 获取匹配历史
  const memberIds = submissions.map((s) => s.member_id)
  const historyMap = await fetchMatchHistory(memberIds)

  // 3. 转换为 MatchCandidate（从 submission 读取本轮偏好）
  const candidates = submissions.map((sub) => {
    const member = Array.isArray(sub.member) ? sub.member[0] : sub.member
    const history = historyMap.get(sub.member_id) ?? []
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
      config: config as unknown as Record<string, unknown>,
      total_candidates: result.metadata.candidateCount,
      total_matched: result.pairs.length * 2,
      total_unmatched: result.unmatched.length,
      created_by: admin.id,
    })
    .select("id")
    .single()

  if (sErr) return { error: sErr.message }

  // 6. 保存 match_results
  const memberIdByName = new Map<string, string>()
  for (const sub of submissions) {
    const m = Array.isArray(sub.member) ? sub.member[0] : sub.member
    const name = m?.member_identity?.full_name ?? m?.member_identity?.nickname
    if (name) memberIdByName.set(name, sub.member_id)
  }

  const rows = result.pairs.map((pair) => ({
    session_id: session.id,
    member_a_id: memberIdByName.get(pair.userA) ?? submissions[0]?.member_id,
    member_b_id: memberIdByName.get(pair.userB) ?? submissions[1]?.member_id,
    total_score: pair.score.totalScore,
    score_breakdown: pair.score.breakdown,
    rank: pair.rank,
  }))

  if (rows.length > 0) {
    const { error: rErr } = await supabase.from("match_results").insert(rows)
    if (rErr) return { error: rErr.message }
  }

  // 7. 更新轮次状态为 matched
  await supabase.from("match_rounds").update({ status: "matched" }).eq("id", roundId)

  return { success: true, sessionId: session.id }
}
