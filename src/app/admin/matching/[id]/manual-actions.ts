"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { buildRoundCandidates } from "@/lib/matching/build-round-candidates"
import { checkHardConstraints, checkGroupConstraints } from "@/lib/matching/constraints"
import { findStrictCommonSlot } from "@/lib/matching/match-utils"
import { scorePair } from "@/lib/matching/scorer"
import { getCommonSlots } from "@/lib/matching/time-filter"
import { DEFAULT_CONFIG } from "@/lib/matching/config"
import { fetchPairRelations } from "@/lib/queries/pair-relations-build"
import { syncSessionSummary } from "@/lib/matching/session-summary-sync"
import { validateUuids } from "@/lib/sanitize"
import type { MatchCandidate, ScoreComponent } from "@/lib/matching/types"
import type { Json } from "@/types/database.types"

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

  // 性别兼容：有偏好的成员，组内至少一人满足即可
  const genderDetails: string[] = []
  let genderOk = true
  for (const member of candidates) {
    if (!member.genderPref || member.genderPref === "都可以") continue
    const others = candidates.filter((o) => o !== member)
    const hasMatch = others.some((o) => {
      const g = displayGender(o.gender)
      return member.genderPref === g || !o.gender
    })
    if (hasMatch) {
      genderDetails.push(`${member.name}偏好${member.genderPref} → 组内有满足 ✓`)
    } else {
      genderOk = false
      const otherGenders = others.map((o) => `${o.name}(${displayGender(o.gender)})`).join("、")
      genderDetails.push(`${member.name}偏好${member.genderPref}，但组内无人满足: ${otherGenders} ✗`)
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

  const { candidates } = await buildRoundCandidates(roundId, [memberAId, memberBId])
  const [candidateA, candidateB] = candidates
  const config = { ...DEFAULT_CONFIG }

  const pairRelations = await fetchPairRelations([memberAId, memberBId])
  const constraint = checkHardConstraints(candidateA, candidateB, config, pairRelations)

  const score = scorePair(candidateA, candidateB, config, pairRelations)
  const commonSlots = getCommonSlots(candidateA.availability, candidateB.availability)
  const bestSlot = commonSlots.length > 0 ? `${commonSlots[0].date}_${commonSlots[0].slot}` : null

  // 构建硬约束条目（供前端展示）
  const constraints = buildPairConstraints(candidateA, candidateB, bestSlot)

  return {
    compatible: constraint.passed,
    warnings: constraint.reasons,
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

  const { candidates } = await buildRoundCandidates(roundId, memberIds)
  const config = { ...DEFAULT_CONFIG }
  const pairRelations = await fetchPairRelations(memberIds)

  // 检查每个成员能否加入组（获取详细原因）
  const warnings: string[] = []
  const blacklistReasons: string[] = []
  for (let i = 1; i < candidates.length; i++) {
    const existing = candidates.slice(0, i)
    const result = checkGroupConstraints(candidates[i], existing, config, pairRelations)
    if (!result.passed) {
      for (const r of result.reasons) {
        warnings.push(r)
        // 分类：黑名单/冷却期 vs 其他
        if (r.includes("黑名单") || r.includes("冷却期")) {
          blacklistReasons.push(r)
        }
      }
    }
  }

  // 找严格公共时段（所有人都有的时段，不用 fallback）
  const bestSlot = findStrictCommonSlot(candidates)
  const hasSlot = bestSlot !== null

  if (!hasSlot) warnings.push("无共同可用时段")

  // 构建约束条目
  const constraints = buildGroupConstraints(candidates, hasSlot ? bestSlot : null)

  // 追加黑名单/冷却期约束条目（显示具体原因）
  if (blacklistReasons.length > 0) {
    constraints.push({ label: "黑名单/冷却期", status: "fail", details: blacklistReasons })
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
  const roundId = await getSessionRoundId(sessionId)
  if (!roundId) {
    return { error: "旧测试匹配记录仅支持查看，不能继续手动配对" }
  }

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
  let candidates: MatchCandidate[]
  try {
    const bundle = await buildRoundCandidates(roundId, memberIds)
    candidates = bundle.candidates
  } catch (error) {
    return { error: error instanceof Error ? error.message : "无法获取本轮问卷数据" }
  }

  let totalScore = 0
  let scoreBreakdown: Json = null
  let bestSlot: string | null = null
  const config = { ...DEFAULT_CONFIG }
  const pairRelations = await fetchPairRelations(memberIds)

  if (memberIds.length === 2) {
    // 双人：完整评分，但无共同时段时禁止写入
    const [candidateA, candidateB] = candidates
    const commonSlots = getCommonSlots(candidateA.availability, candidateB.availability)
    if (commonSlots.length === 0) return { error: "无共同可用时段，无法配对" }

    const score = scorePair(candidateA, candidateB, config, pairRelations)
    totalScore = score.totalScore
    scoreBreakdown = score.breakdown as unknown as Json
    bestSlot = `${commonSlots[0].date}_${commonSlots[0].slot}`
  } else {
    // 多人组：只要严格公共时段，没有就禁止写入
    bestSlot = findStrictCommonSlot(candidates)
    if (!bestSlot) return { error: "无共同可用时段，无法组建多人组" }
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

  await syncSessionSummary(supabase, sessionId)
  revalidatePath(`/admin/matching/${sessionId}`)
  return { success: true }
}
