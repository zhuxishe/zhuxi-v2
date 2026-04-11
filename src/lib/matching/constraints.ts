/**
 * 硬约束检查 — 不满足则直接排除，绝不放松
 *
 * 硬约束清单：
 * 1. 性别倾向：双向满足
 * 2. 共同时段：至少1个（在 scorer.ts 中检查）
 * 3. 黑名单：绝对不配（1分自动 + 管理员手动）
 * 4. 双五分冷却期：第2次必须跳过
 */

import type { MatchCandidate, MatchingConfig } from "./types"
import type { PairRelation } from "./pair-history"
import { getPairStatus } from "./pair-history"

export interface ConstraintResult {
  passed: boolean
  reasons: string[]
}

/**
 * 检查两个候选人是否满足所有硬约束
 */
export function checkHardConstraints(
  a: MatchCandidate,
  b: MatchCandidate,
  config: MatchingConfig,
  pairRelations?: Map<string, PairRelation>,
): ConstraintResult {
  const reasons: string[] = []

  // 硬约束1: 性别倾向
  if (config.hardConstraints.enforceGender) {
    if (!isGenderCompatible(a, b)) {
      reasons.push(`性别不兼容: ${a.name}偏好${a.genderPref}, ${b.name}是${b.gender || "未知"}`)
    }
  }

  // 硬约束1.5: 游戏类型兼容（双人≠多人）
  if (!isGameTypeCompatible(a.gameTypePref, b.gameTypePref)) {
    reasons.push(`游戏类型不兼容: ${a.name}选${a.gameTypePref}, ${b.name}选${b.gameTypePref}`)
  }

  // 硬约束2: 禁忌标签互斥
  if (a.tabooTags?.length || b.tabooTags?.length) {
    const aTaboos = new Set(a.tabooTags ?? [])
    const bTaboos = new Set(b.tabooTags ?? [])
    // Check if any of b's traits overlap with a's taboos, and vice versa
    const aTags = new Set([...(a.interestTags ?? []), ...(a.socialTags ?? [])])
    const bTags = new Set([...(b.interestTags ?? []), ...(b.socialTags ?? [])])
    for (const t of bTags) {
      if (aTaboos.has(t)) reasons.push(`${a.name}的禁忌标签与${b.name}冲突: ${t}`)
    }
    for (const t of aTags) {
      if (bTaboos.has(t)) reasons.push(`${b.name}的禁忌标签与${a.name}冲突: ${t}`)
    }
  }

  // 硬约束3: 新手接受度
  if (a.acceptBeginners === false && b.level === 0) {
    reasons.push(`${a.name}不接受新手, ${b.name}是新手`)
  }
  if (b.acceptBeginners === false && a.level === 0) {
    reasons.push(`${b.name}不接受新手, ${a.name}是新手`)
  }

  // 硬约束4+5: 黑名单 + 冷却期（需要配对关系数据）
  if (pairRelations) {
    const rel = getPairStatus(pairRelations, a.submissionId, b.submissionId)

    if (rel.status === "blacklist") {
      reasons.push(`黑名单: ${rel.reason}`)
    }

    if (rel.status === "cooldown") {
      reasons.push(`双五分冷却期: ${rel.reason}`)
    }
  }

  return {
    passed: reasons.length === 0,
    reasons,
  }
}

/**
 * 检查配对是否为"避免重复"（第一轮排除，第二轮允许）
 * 返回 true = 应该在第一轮避免
 */
export function shouldAvoidPair(
  a: MatchCandidate,
  b: MatchCandidate,
  pairRelations?: Map<string, PairRelation>,
): boolean {
  if (!pairRelations) return false
  const rel = getPairStatus(pairRelations, a.submissionId, b.submissionId)
  return rel.status === "avoid"
}

/**
 * 获取双五分重逢加分
 * 返回 > 0 表示应该优先配对
 */
export function getReunionBonus(
  a: MatchCandidate,
  b: MatchCandidate,
  pairRelations?: Map<string, PairRelation>,
): number {
  if (!pairRelations) return 0
  const rel = getPairStatus(pairRelations, a.submissionId, b.submissionId)
  return rel.status === "reunion" ? 30 : 0
}

// ── 性别约束 ──

function isGenderCompatible(a: MatchCandidate, b: MatchCandidate): boolean {
  return (
    isOneWayGenderOk(a.genderPref, b.gender) &&
    isOneWayGenderOk(b.genderPref, a.gender)
  )
}

/** 游戏类型兼容（双人配对场景）：双方都选多人→不兼容，都可以兼容任何，空值视为都可以 */
function isGameTypeCompatible(prefA: string, prefB: string): boolean {
  const a = prefA || "都可以"
  const b = prefB || "都可以"
  if (a === "都可以" || b === "都可以") return true
  if (a === "双人" && b === "双人") return true
  // 双方都选"多人" → 不兼容（应该组多人组，不应双人配）
  // 一方"双人"一方"多人" → 不兼容
  return false
}

function isOneWayGenderOk(pref: string, targetGender: string | null): boolean {
  if (!pref || pref === "都可以") return true
  if (!targetGender) return true
  if (pref === "男" && targetGender === "男") return true
  if (pref === "女" && targetGender === "女") return true
  return false
}

// ── 多人组约束 ──

/**
 * 检查一个候选人能否加入一个多人组
 * 检查：游戏类型 + 性别 + 黑名单 + 冷却期
 */
export function checkGroupConstraints(
  candidate: MatchCandidate,
  groupMembers: MatchCandidate[],
  config: MatchingConfig,
  pairRelations?: Map<string, PairRelation>,
): boolean {
  // 游戏类型检查：多人组只接受"多人"或"都可以"（含空值）偏好的候选人
  const candPref = candidate.gameTypePref || "都可以"
  if (candPref === "双人") return false
  for (const member of groupMembers) {
    const mPref = member.gameTypePref || "都可以"
    if (mPref === "双人") return false
  }

  // 性别检查：每个有偏好的成员，组内其他人都必须满足其偏好
  if (config.hardConstraints.enforceGender) {
    const allMembers = [...groupMembers, candidate]
    for (const member of allMembers) {
      if (!member.genderPref || member.genderPref === "都可以") continue
      // 检查组内其他每个人的性别是否满足此成员的偏好
      for (const other of allMembers) {
        if (other === member) continue
        if (!isOneWayGenderOk(member.genderPref, other.gender)) return false
      }
    }
  }

  // 黑名单 + 冷却期检查：候选人不能和组内任何人有黑名单/冷却关系
  if (pairRelations) {
    for (const member of groupMembers) {
      const rel = getPairStatus(pairRelations, candidate.submissionId, member.submissionId)
      if (rel.status === "blacklist" || rel.status === "cooldown") return false
    }
  }

  return true
}

/**
 * 检查多人组是否应该在第一轮避免（组内有非双五重复）
 */
export function groupHasAvoidPairs(
  candidate: MatchCandidate,
  groupMembers: MatchCandidate[],
  pairRelations?: Map<string, PairRelation>,
): boolean {
  if (!pairRelations) return false
  for (const member of groupMembers) {
    if (shouldAvoidPair(candidate, member, pairRelations)) return true
  }
  return false
}
