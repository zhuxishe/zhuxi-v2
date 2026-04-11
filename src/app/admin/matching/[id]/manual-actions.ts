"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { submissionToCandidate } from "@/lib/matching/adapter-submission"
import { checkHardConstraints, checkGroupConstraints } from "@/lib/matching/constraints"
import { scorePair } from "@/lib/matching/scorer"
import { getCommonSlots } from "@/lib/matching/time-filter"
import type { MatchCandidate as MC } from "@/lib/matching/types"
import { DEFAULT_CONFIG } from "@/lib/matching/config"
import { fetchPairRelations } from "@/lib/queries/pair-relations-build"
import { fetchMatchHistory } from "@/lib/queries/match-history"
import { validateUuids } from "@/lib/sanitize"
import type { MatchCandidate, ScoreComponent } from "@/lib/matching/types"
import type { Json } from "@/types/database.types"

/** 严格查找所有人都有的公共时段（无 fallback） */
function findStrictCommonSlot(members: MC[]): string | null {
  if (members.length === 0) return null
  for (const [date, slots] of Object.entries(members[0].availability)) {
    for (const slot of slots) {
      if (members.every((m) => m.availability[date]?.includes(slot))) {
        return `${date}_${slot}`
      }
    }
  }
  return null
}

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

/** 获取 session 对应的 round_id */
async function getSessionRoundId(sessionId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("match_sessions")
    .select("round_id")
    .eq("id", sessionId)
    .single()
  return data?.round_id ?? null
}

/** 获取成员在某轮次的问卷提交 */
async function fetchSubmission(roundId: string, memberId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("match_round_submissions")
    .select("*")
    .eq("round_id", roundId)
    .eq("member_id", memberId)
    .single()
  return data
}

/** 构建 MatchCandidate：必须有问卷数据 */
async function buildCandidate(memberId: string, roundId: string) {
  const member = await fetchMemberFull(memberId)
  const historyMap = await fetchMatchHistory([memberId])
  const history = historyMap.get(memberId) ?? []

  const sub = await fetchSubmission(roundId, memberId)
  if (!sub) {
    throw new Error(`成员 ${memberId} 未提交本轮问卷，无法参与匹配`)
  }
  return submissionToCandidate(sub, member, history)
}

/** 批量构建候选人 */
async function buildCandidates(memberIds: string[], roundId: string) {
  return Promise.all(memberIds.map((id) => buildCandidate(id, roundId)))
}

// ── 硬约束条目（供前端展示） ──

export interface ConstraintItem {
  label: string
  status: "pass" | "fail" | "warn"
  details: string[]
}

function displayGender(g: string | null): string {
  if (g === "male") return "男"
  if (g === "female") return "女"
  return g || "未知"
}

/** 构建双人硬约束条目列表 */
function buildPairConstraints(
  a: MatchCandidate, b: MatchCandidate,
  bestSlot: string | null,
): ConstraintItem[] {
  const items: ConstraintItem[] = []

  // 性别兼容
  const aGender = displayGender(a.gender)
  const bGender = displayGender(b.gender)
  const aOk = b.genderPref === "都可以" || !b.genderPref || b.genderPref === aGender
  const bOk = a.genderPref === "都可以" || !a.genderPref || a.genderPref === bGender
  items.push({
    label: "性别兼容",
    status: aOk && bOk ? "pass" : "fail",
    details: [
      `${a.name}(${aGender}) → ${b.name}偏好: ${b.genderPref} ${aOk ? "✓" : "✗"}`,
      `${b.name}(${bGender}) → ${a.name}偏好: ${a.genderPref} ${bOk ? "✓" : "✗"}`,
    ],
  })

  // 游戏类型（双人配对中双方都选"多人"→ 不兼容）
  const bothMulti = a.gameTypePref === "多人" && b.gameTypePref === "多人"
  const gtOk = !bothMulti && (
    a.gameTypePref === "都可以" || b.gameTypePref === "都可以" || a.gameTypePref === b.gameTypePref
  )
  items.push({
    label: "游戏类型",
    status: gtOk ? "pass" : "fail",
    details: [
      `${a.name}: ${a.gameTypePref} ↔ ${b.name}: ${b.gameTypePref}`,
      ...(bothMulti ? ["双方都选多人，请添加更多成员组建多人组"] : []),
    ],
  })

  // 共同时段
  items.push({
    label: "共同时段",
    status: bestSlot ? "pass" : "fail",
    details: [bestSlot ? bestSlot.replace("_", " ") : "无共同可用时段"],
  })

  return items
}

/** 构建多人组硬约束条目列表 */
function buildGroupConstraints(
  candidates: MatchCandidate[], bestSlot: string | null,
): ConstraintItem[] {
  const items: ConstraintItem[] = []

  // 性别兼容：每个有偏好的人，组内其他人必须满足其偏好
  const genderDetails: string[] = []
  let genderOk = true
  for (const member of candidates) {
    if (!member.genderPref || member.genderPref === "都可以") continue
    for (const other of candidates) {
      if (other === member) continue
      const otherGender = displayGender(other.gender)
      const ok = member.genderPref === otherGender || !other.gender
      if (!ok) {
        genderOk = false
        genderDetails.push(`${member.name}偏好${member.genderPref}，但${other.name}是${otherGender} ✗`)
      }
    }
  }
  if (genderDetails.length === 0) {
    genderDetails.push(candidates.map((c) => `${c.name}(${displayGender(c.gender)})`).join("、"))
  }
  items.push({ label: "性别兼容", status: genderOk ? "pass" : "fail", details: genderDetails })

  // 游戏类型（多人组只接受"多人"或"都可以"）
  const allOk = candidates.every((c) => c.gameTypePref === "多人" || c.gameTypePref === "都可以" || !c.gameTypePref)
  const prefs = candidates.map((c) => `${c.name}: ${c.gameTypePref}`).join("、")
  items.push({
    label: "游戏类型",
    status: allOk ? "pass" : "fail",
    details: [prefs],
  })

  // 共同时段
  items.push({
    label: "共同时段",
    status: bestSlot ? "pass" : "fail",
    details: [bestSlot ? bestSlot.replace("_", " ") : "无共同可用时段"],
  })

  return items
}

/** 检查两人兼容性（硬约束 + 评分） */
export async function checkPairCompatibility(
  sessionId: string,
  memberAId: string,
  memberBId: string,
) {
  validateUuids([sessionId, memberAId, memberBId])
  await requireAdmin()

  const roundId = await getSessionRoundId(sessionId)
  if (!roundId) throw new Error("该匹配会话无关联轮次，无法获取问卷数据")

  const [candidateA, candidateB] = await Promise.all([
    buildCandidate(memberAId, roundId),
    buildCandidate(memberBId, roundId),
  ])
  const config = { ...DEFAULT_CONFIG }

  const pairRelations = await fetchPairRelations([memberAId, memberBId])
  const constraint = checkHardConstraints(candidateA, candidateB, config, pairRelations)

  // 额外黑名单 DB 检查
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

  const score = scorePair(candidateA, candidateB, config, pairRelations)
  const commonSlots = getCommonSlots(candidateA.availability, candidateB.availability)
  const bestSlot = commonSlots.length > 0 ? `${commonSlots[0].date}_${commonSlots[0].slot}` : null

  // 构建硬约束条目（供前端展示）
  const constraints = buildPairConstraints(candidateA, candidateB, bestSlot)

  return {
    compatible: constraint.passed && blacklistWarnings.length === 0,
    warnings: [...constraint.reasons, ...blacklistWarnings],
    constraints,
    score: score.totalScore,
    breakdown: score.breakdown as ScoreComponent[],
    bestSlot,
  }
}

/** 检查多人组兼容性（硬约束，无评分） */
export async function checkGroupCompatibility(
  sessionId: string,
  memberIds: string[],
) {
  validateUuids([sessionId, ...memberIds])
  await requireAdmin()

  const roundId = await getSessionRoundId(sessionId)
  if (!roundId) throw new Error("该匹配会话无关联轮次，无法获取问卷数据")

  const candidates = await buildCandidates(memberIds, roundId)
  const config = { ...DEFAULT_CONFIG }
  const pairRelations = await fetchPairRelations(memberIds)

  // 检查每个成员能否加入组
  const warnings: string[] = []
  for (let i = 1; i < candidates.length; i++) {
    const existing = candidates.slice(0, i)
    const ok = checkGroupConstraints(candidates[i], existing, config, pairRelations)
    if (!ok) {
      warnings.push(`${candidates[i].name} 与组内成员存在约束冲突`)
    }
  }

  // 找严格公共时段（所有人都有的时段，不用 fallback）
  const bestSlot = findStrictCommonSlot(candidates)
  const hasSlot = bestSlot !== null

  if (!hasSlot) warnings.push("无共同可用时段")

  // 构建约束条目
  const constraints = buildGroupConstraints(candidates, hasSlot ? bestSlot : null)

  // 追加黑名单约束条目
  if (warnings.some((w) => w.includes("约束冲突"))) {
    constraints.push({ label: "黑名单/冷却期", status: "fail", details: warnings.filter((w) => w.includes("约束冲突")) })
  } else {
    constraints.push({ label: "黑名单/冷却期", status: "pass", details: ["无冲突"] })
  }

  return {
    compatible: warnings.length === 0,
    warnings,
    constraints,
    bestSlot: hasSlot ? bestSlot : null,
  }
}

/** 手动配对：支持 2-6 人 */
export async function manualPair(
  sessionId: string,
  memberIds: string[],
) {
  validateUuids([sessionId, ...memberIds])
  await requireAdmin()

  if (memberIds.length < 2) return { error: "至少需要 2 人" }
  if (memberIds.length > 6) return { error: "最多 6 人" }

  const supabase = await createClient()

  // ── 防重复校验 ──
  for (const mId of memberIds) {
    const { data: existing } = await supabase
      .from("match_results")
      .select("id")
      .eq("session_id", sessionId)
      .neq("status", "cancelled")
      .or(`member_a_id.eq.${mId},member_b_id.eq.${mId}`)
      .limit(1)

    if (existing && existing.length > 0) {
      return { error: `成员已在此次匹配中有活跃配对，请先拆分旧配对` }
    }

    const { data: existingGroup } = await supabase
      .from("match_results")
      .select("id")
      .eq("session_id", sessionId)
      .neq("status", "cancelled")
      .contains("group_members", [mId])
      .limit(1)

    if (existingGroup && existingGroup.length > 0) {
      return { error: `成员已在多人组中，请先拆分旧配对` }
    }
  }

  // ── 计算评分/时段 ──
  let totalScore = 0
  let scoreBreakdown: Json = null
  let bestSlot: string | null = null

  if (memberIds.length === 2) {
    // 双人：完整评分
    try {
      const result = await checkPairCompatibility(sessionId, memberIds[0], memberIds[1])
      totalScore = result.score
      scoreBreakdown = result.breakdown as unknown as Json
      bestSlot = result.bestSlot
    } catch { /* 评分失败不阻止 */ }
  } else {
    // 多人组：只取时段
    try {
      const result = await checkGroupCompatibility(sessionId, memberIds)
      bestSlot = result.bestSlot
    } catch { /* 失败不阻止 */ }
  }

  // ── 插入配对 ──
  const isDuo = memberIds.length === 2
  const { error } = await supabase.from("match_results").insert({
    session_id: sessionId,
    member_a_id: memberIds[0],
    member_b_id: isDuo ? memberIds[1] : null,
    group_members: isDuo ? null : memberIds,
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

  // ── 清理未匹配诊断 ──
  await supabase
    .from("unmatched_diagnostics")
    .delete()
    .eq("session_id", sessionId)
    .in("member_id", memberIds)

  revalidatePath(`/admin/matching/${sessionId}`)
  return { success: true }
}
