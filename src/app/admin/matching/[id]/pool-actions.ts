"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchPairRelations } from "@/lib/queries/pair-relations-build"
import { fetchCancelledPoolIds } from "@/lib/queries/cancelled-pool"
import { buildRoundCandidates } from "@/lib/matching/build-round-candidates"
import { runFullMatching } from "@/lib/matching/run-matching"
import { DEFAULT_CONFIG } from "@/lib/matching/config"
import { syncSessionSummary } from "@/lib/matching/session-summary-sync"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import { matchingPublicationError, PUBLISHED_MATCH_EDIT_ERROR } from "@/lib/matching/publication-errors"
import type { Json } from "@/types/database.types"

/** 对取消池成员重新运行匹配算法 */
export async function runPoolRematch(sessionId: string, rawReason: string) {
  await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }

  // Check publication before reading the pool or running the existing algorithm.
  const supabase = await createClient()
  const { data: session, error: sessionError } = await supabase
    .from("match_sessions")
    .select("round_id, status")
    .eq("id", sessionId)
    .single()
  if (sessionError) return { error: "无法读取匹配会话，请稍后重试" }
  const roundId = session?.round_id
  if (!roundId) {
    return { error: "该匹配会话无关联轮次，无法获取问卷数据" }
  }
  if (session.status !== "draft") return { error: PUBLISHED_MATCH_EDIT_ERROR }

  const memberIds = await fetchCancelledPoolIds(sessionId)
  if (memberIds.length < 2) {
    return { error: "池中至少需要 2 人才能匹配" }
  }

  // 3. 构建 MatchCandidate（从本轮问卷统一读取）
  const { candidates } = await buildRoundCandidates(roundId, memberIds)

  // 4. 构建 pairRelations
  const pairRelations = await fetchPairRelations(memberIds)

  // 5. 运行匹配
  const config = { ...DEFAULT_CONFIG }
  const idMap = new Map<string, string>()
  for (const memberId of memberIds) idMap.set(memberId, memberId)

  const result = runFullMatching(candidates, config, idMap, pairRelations)

  // 6. 写入新 match_results
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
    audit_reason: reasonResult.reason,
  }))

  if (rows.length > 0) {
    const { error } = await supabase.from("match_results").insert(rows)
    if (error) {
      console.error("[runPoolRematch]", error)
      return { error: matchingPublicationError(error, "操作失败") }
    }
  }

  await syncSessionSummary(supabase, sessionId, reasonResult.reason)
  revalidatePath(`/admin/matching/${sessionId}`)
  return { success: true, matchCount: result.rows.length }
}
