"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchPairRelations } from "@/lib/queries/pair-relations-build"
import { fetchCancelledPoolIds } from "@/lib/queries/cancelled-pool"
import { buildRoundCandidates } from "@/lib/matching/build-round-candidates"
import { runFullMatching } from "@/lib/matching/run-matching"
import { DEFAULT_CONFIG } from "@/lib/matching/config"
import type { Json } from "@/types/database.types"

/** 对取消池成员重新运行匹配算法 */
export async function runPoolRematch(sessionId: string) {
  await requireAdmin()

  // 1. 获取已取消的成员 ID
  const memberIds = await fetchCancelledPoolIds(sessionId)
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
