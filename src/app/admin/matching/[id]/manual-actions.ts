"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { toMatchCandidate } from "@/lib/matching/adapter"
import { checkHardConstraints } from "@/lib/matching/constraints"
import { scorePair } from "@/lib/matching/scorer"
import { getCommonSlots } from "@/lib/matching/time-filter"
import { DEFAULT_CONFIG } from "@/lib/matching/config"
import { fetchPairRelations } from "@/lib/queries/pair-relations-build"
import { validateUuids } from "@/lib/sanitize"
import type { ScoreComponent } from "@/lib/matching/types"
import type { Json } from "@/types/database.types"

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
  validateUuids([memberAId, memberBId])
  await requireAdmin()

  const [memberA, memberB] = await Promise.all([
    fetchMemberFull(memberAId),
    fetchMemberFull(memberBId),
  ])

  const candidateA = toMatchCandidate(memberA)
  const candidateB = toMatchCandidate(memberB)
  const config = { ...DEFAULT_CONFIG }

  // 构建 pairRelations（支持 cooldown/reunion 检查）
  const idToName = new Map<string, string>()
  idToName.set(memberAId, candidateA.name)
  idToName.set(memberBId, candidateB.name)
  const pairRelations = await fetchPairRelations([memberAId, memberBId], idToName)

  // 硬约束检查（含黑名单 + 冷却期）
  const constraint = checkHardConstraints(candidateA, candidateB, config, pairRelations)

  // 额外黑名单 DB 检查（UUID 级安全网，防止名字映射遗漏）
  const supabase = await createClient()
  const blacklistWarnings: string[] = []
  const [{ data: relsAB }, { data: relsBA }] = await Promise.all([
    supabase.from("pair_relationships").select("status, notes")
      .eq("member_a_id", memberAId).eq("member_b_id", memberBId),
    supabase.from("pair_relationships").select("status, notes")
      .eq("member_a_id", memberBId).eq("member_b_id", memberAId),
  ])
  for (const rel of [...(relsAB ?? []), ...(relsBA ?? [])]) {
    if (rel.status === "blacklist") {
      blacklistWarnings.push(`黑名单: ${rel.notes || "无备注"}`)
    }
  }

  // 评分
  const score = scorePair(candidateA, candidateB, config)

  // 计算最佳时段
  const commonSlots = getCommonSlots(candidateA.availability, candidateB.availability)
  const bestSlot = commonSlots.length > 0 ? `${commonSlots[0].date}_${commonSlots[0].slot}` : null

  return {
    compatible: constraint.passed && blacklistWarnings.length === 0,
    warnings: [...constraint.reasons, ...blacklistWarnings],
    score: score.totalScore,
    breakdown: score.breakdown as ScoreComponent[],
    bestSlot,
  }
}

/** 手动配对：插入一条 match_result */
export async function manualPair(
  sessionId: string,
  memberAId: string,
  memberBId: string,
) {
  validateUuids([sessionId, memberAId, memberBId])
  await requireAdmin()
  const supabase = await createClient()

  // ── 防重复校验：确保两人在此 session 中没有活跃配对 ──
  for (const mId of [memberAId, memberBId]) {
    const { data: existing } = await supabase
      .from("match_results")
      .select("id")
      .eq("session_id", sessionId)
      .neq("status", "cancelled")
      .or(`member_a_id.eq.${mId},member_b_id.eq.${mId}`)
      .limit(1)

    if (existing && existing.length > 0) {
      const label = mId === memberAId ? "A" : "B"
      return { error: `成员 ${label} 已在此次匹配中有活跃配对，请先拆分旧配对` }
    }

    // 同时检查 group_members 数组
    const { data: existingGroup } = await supabase
      .from("match_results")
      .select("id")
      .eq("session_id", sessionId)
      .neq("status", "cancelled")
      .contains("group_members", [mId])
      .limit(1)

    if (existingGroup && existingGroup.length > 0) {
      const label = mId === memberAId ? "A" : "B"
      return { error: `成员 ${label} 已在多人组中，请先拆分旧配对` }
    }
  }

  // ── 计算评分 ──
  let totalScore = 0
  let scoreBreakdown: Json = null
  let bestSlot: string | null = null
  try {
    const result = await checkPairCompatibility(memberAId, memberBId)
    totalScore = result.score
    scoreBreakdown = result.breakdown as unknown as Json
    bestSlot = result.bestSlot
  } catch {
    // 评分失败不阻止配对
  }

  // ── 插入配对 ──
  const { error } = await supabase.from("match_results").insert({
    session_id: sessionId,
    member_a_id: memberAId,
    member_b_id: memberBId,
    total_score: totalScore,
    score_breakdown: scoreBreakdown,
    best_slot: bestSlot,
    status: "draft",
    rank: 999,
  })

  if (error) {
    console.error("[manualPair]", error)
    return { error: "操作失败" }
  }

  // ── 清理未匹配诊断记录 ──
  await supabase
    .from("unmatched_diagnostics")
    .delete()
    .eq("session_id", sessionId)
    .in("member_id", [memberAId, memberBId])

  revalidatePath(`/admin/matching/${sessionId}`)
  return { success: true }
}
