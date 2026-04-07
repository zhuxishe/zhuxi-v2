"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { toMatchCandidate } from "@/lib/matching/adapter"
import { checkHardConstraints } from "@/lib/matching/constraints"
import { scorePair } from "@/lib/matching/scorer"
import { DEFAULT_CONFIG } from "@/lib/matching/config"

/** 获取单个成员完整资料 */
async function fetchMemberFull(memberId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("members")
    .select(`
      id, member_number, status, attractiveness_score,
      member_identity (*),
      member_interests (*),
      member_personality (*),
      member_language (*),
      member_boundaries (*),
      member_dynamic_stats (activity_count, reliability_score),
      personality_quiz_results (score_e, score_a, score_o, score_c, score_n)
    `)
    .eq("id", memberId)
    .single()

  if (error) throw error
  return data
}

/** 检查两人兼容性（硬约束 + 评分） */
export async function checkPairCompatibility(
  memberAId: string,
  memberBId: string,
) {
  await requireAdmin()

  const [memberA, memberB] = await Promise.all([
    fetchMemberFull(memberAId),
    fetchMemberFull(memberBId),
  ])

  const candidateA = toMatchCandidate(memberA)
  const candidateB = toMatchCandidate(memberB)
  const config = { ...DEFAULT_CONFIG }

  // 硬约束检查
  const constraint = checkHardConstraints(candidateA, candidateB, config)

  // 黑名单检查（从 pair_relationships 表查）
  const supabase = await createClient()
  const blacklistWarnings: string[] = []
  const { data: rels } = await supabase
    .from("pair_relationships")
    .select("status, notes")
    .or(
      `and(member_a_id.eq.${memberAId},member_b_id.eq.${memberBId}),` +
      `and(member_a_id.eq.${memberBId},member_b_id.eq.${memberAId})`
    )

  for (const rel of rels ?? []) {
    if (rel.status === "blacklist") {
      blacklistWarnings.push(`黑名单: ${rel.notes || "无备注"}`)
    }
  }

  // 评分
  const score = scorePair(candidateA, candidateB, config)

  return {
    compatible: constraint.passed && blacklistWarnings.length === 0,
    warnings: [...constraint.reasons, ...blacklistWarnings],
    score: score.totalScore,
    breakdown: score.breakdown.map((b) => ({
      label: b.label,
      weighted: b.weightedScore,
    })),
  }
}

/** 手动配对：插入一条 match_result */
export async function manualPair(
  sessionId: string,
  memberAId: string,
  memberBId: string,
) {
  const admin = await requireAdmin()
  const supabase = await createClient()

  // 计算评分（可选但有用）
  let totalScore = 0
  try {
    const result = await checkPairCompatibility(memberAId, memberBId)
    totalScore = result.score
  } catch {
    // 评分失败不阻止配对
  }

  const { error } = await supabase.from("match_results").insert({
    session_id: sessionId,
    member_a_id: memberAId,
    member_b_id: memberBId,
    total_score: totalScore,
    game_type: "手动配对",
    status: "draft",
    rank: 999,
    created_by: admin.id,
  })

  if (error) return { error: error.message }
  return { success: true }
}
