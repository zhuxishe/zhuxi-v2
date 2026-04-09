"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchRoundSubmissions } from "@/lib/queries/rounds"
import { fetchMatchHistory } from "@/lib/queries/matching"
import { fetchPairRelations } from "@/lib/queries/pair-relations-build"
import { submissionToCandidate } from "@/lib/matching/adapter"
import { runFullMatching } from "@/lib/matching/run-matching"
import { DEFAULT_CONFIG } from "@/lib/matching/config"
import type { MatchingConfig } from "@/lib/matching/types"

/** 更新轮次状态 */
export async function updateRoundStatus(roundId: string, status: string) {
  await requireAdmin()

  const VALID_STATUSES = ['draft', 'open', 'closed', 'matched']
  if (!VALID_STATUSES.includes(status)) {
    return { error: `无效状态: ${status}` }
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from("match_rounds")
    .update({ status })
    .eq("id", roundId)

  if (error) {
    console.error("[updateRoundStatus]", error)
    return { error: "操作失败" }
  }
  revalidatePath(`/admin/matching/rounds/${roundId}`)
  revalidatePath("/admin/matching")
  return { success: true }
}

/** 基于轮次问卷运行匹配 */
export async function runRoundMatching(roundId: string, sessionName: string) {
  const admin = await requireAdmin()
  const supabase = await createClient()

  // 0. 前置状态校验：只有 closed 状态的轮次才能执行匹配
  const { data: round, error: roundErr } = await supabase
    .from("match_rounds")
    .select("status")
    .eq("id", roundId)
    .single()

  if (roundErr || !round) return { error: "轮次不存在" }
  if (round.status !== "closed") {
    return { error: `当前轮次状态为「${round.status}」，只有「closed」状态才能执行匹配` }
  }

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

  // 4. 构建配对历史关系（黑名单、互评、配对次数）
  // buildPairRelations 用 MatchCandidate.name 作为 key
  const idToName = new Map<string, string>()
  for (const c of candidates) {
    const memberId = submissions.find((s) => s.id === c.submissionId)?.member_id
    if (memberId) idToName.set(memberId, c.name)
  }
  const pairRelations = await fetchPairRelations(memberIds, idToName)

  // 5. 三阶段分流匹配（双人池 → 多人池 → 回流兜底）
  const config: MatchingConfig = { ...DEFAULT_CONFIG }
  const subIdToMemberId = new Map<string, string>()
  for (const sub of submissions) subIdToMemberId.set(sub.id, sub.member_id)

  const result = runFullMatching(candidates, config, subIdToMemberId, pairRelations)

  // 6. 保存 match_session
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

  if (sErr) {
    console.error("[runRoundMatching:session]", sErr)
    return { error: "操作失败" }
  }

  // 7. 保存 match_results
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
    if (rErr) {
      // 补偿：删除孤立的 session，避免脏数据
      await supabase.from("match_sessions").delete().eq("id", session.id)
      console.error("[runRoundMatching:results]", rErr)
      return { error: "操作失败" }
    }
  }

  // 8. 保存未匹配诊断
  if (result.unmatchedIds.length > 0) {
    const diagRows = result.unmatchedIds.map((subId) => ({
      session_id: session.id,
      member_id: subIdToMemberId.get(subId) ?? subId,
      reason: "unmatched_after_all_stages",
      details: { stage: "overflow" } as import("@/types/database.types").Json,
    }))
    await supabase.from("unmatched_diagnostics").insert(diagRows)
  }

  // 9. 更新轮次状态为 matched
  await supabase.from("match_rounds").update({ status: "matched" }).eq("id", roundId)

  revalidatePath(`/admin/matching/rounds/${roundId}`)
  revalidatePath("/admin/matching")
  return { success: true, sessionId: session.id }
}
