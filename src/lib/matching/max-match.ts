/**
 * 最大覆盖匹配算法 v2
 *
 * 两轮匹配：
 * 第一轮（严格）：排除黑名单+冷却期+非双五重复，双五重逢加分
 * 第二轮（放松重复）：仅对第一轮未配上的人，允许非双五重复（但扣分）
 *
 * 核心思想：灵活度低的人优先匹配
 */

import type { MatchCandidate, MatchingConfig, PairScore } from "./types"
import type { PairRelation } from "./pair-history"
import { scorePair } from "./scorer"
import { getCommonSlots } from "./time-filter"
import {
  checkHardConstraints,
  shouldAvoidPair,
  getReunionBonus,
  checkGroupConstraints,
  groupHasAvoidPairs,
} from "./constraints"

export interface MaxMatchPair {
  a: MatchCandidate
  b: MatchCandidate
  score: PairScore
  bestSlot: string
  reunionBonus: number
  isRepeatPair: boolean // 第二轮放松重复的标记
}

export interface MaxMatchResult {
  pairs: MaxMatchPair[]
  unmatched: MatchCandidate[]
  metadata: {
    candidateCount: number
    pairCount: number
    averageScore: number
    round1Pairs: number
    round2Pairs: number
    reunionPairs: number
  }
}

export interface MultiGroupResult {
  groups: { members: MatchCandidate[]; bestSlot: string; avgScore: number; hasRepeat: boolean }[]
  unmatched: MatchCandidate[]
}

/**
 * 最大覆盖双人匹配
 *
 * 自动多次尝试（最多 MAX_ATTEMPTS 次），取未匹配人数最少的结果。
 * 如果某次全员匹配则立即返回。
 * 每次尝试会打乱同灵活度候选人的排序，产生不同的贪心路径。
 */
const MAX_ATTEMPTS = 20

export function runMaxCoverageDuoMatching(
  candidates: MatchCandidate[],
  config: MatchingConfig,
  pairRelations?: Map<string, PairRelation>,
): MaxMatchResult {
  const n = candidates.length
  if (n < 2) {
    return emptyResult(candidates)
  }

  let bestResult: MaxMatchResult | null = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = runSingleAttempt(candidates, config, pairRelations, attempt)

    // 全员匹配 → 直接返回
    if (result.unmatched.length === 0) return result

    // 保留最好结果（未匹配最少，同未匹配数取总分最高）
    if (
      !bestResult ||
      result.unmatched.length < bestResult.unmatched.length ||
      (result.unmatched.length === bestResult.unmatched.length &&
        result.metadata.averageScore > bestResult.metadata.averageScore)
    ) {
      bestResult = result
    }
  }

  return bestResult!
}

function runSingleAttempt(
  candidates: MatchCandidate[],
  config: MatchingConfig,
  pairRelations: Map<string, PairRelation> | undefined,
  seed: number,
): MaxMatchResult {
  // 严格模式
  const round1Pairs = runRound(candidates, config, pairRelations, true, seed)

  const matched1 = new Set<string>()
  for (const p of round1Pairs) {
    matched1.add(p.a.submissionId)
    matched1.add(p.b.submissionId)
  }

  // 放松重复
  const unmatched1 = candidates.filter((c) => !matched1.has(c.submissionId))
  const round2Pairs = unmatched1.length >= 2
    ? runRound(unmatched1, config, pairRelations, false, seed).map((p) => ({ ...p, isRepeatPair: true }))
    : []

  const allPairs = [...round1Pairs, ...round2Pairs]
  const matchedAll = new Set(allPairs.flatMap((p) => [p.a.submissionId, p.b.submissionId]))
  const finalUnmatched = candidates.filter((c) => !matchedAll.has(c.submissionId))

  const totalScore = allPairs.reduce((s, p) => s + p.score.totalScore, 0)

  return {
    pairs: allPairs,
    unmatched: finalUnmatched,
    metadata: {
      candidateCount: candidates.length,
      pairCount: allPairs.length,
      averageScore: allPairs.length > 0 ? totalScore / allPairs.length : 0,
      round1Pairs: round1Pairs.length,
      round2Pairs: round2Pairs.length,
      reunionPairs: allPairs.filter((p) => p.reunionBonus > 0).length,
    },
  }
}

/**
 * 单轮匹配
 * strictAvoid=true: 排除非双五重复配对
 * strictAvoid=false: 允许重复但扣分
 */
function runRound(
  candidates: MatchCandidate[],
  config: MatchingConfig,
  pairRelations: Map<string, PairRelation> | undefined,
  strictAvoid: boolean,
  seed: number = 0,
): MaxMatchPair[] {
  const n = candidates.length

  // 1. 构建可行配对
  const feasible: { i: number; j: number; score: PairScore; bestSlot: string; bonus: number; isRepeat: boolean }[] = []

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = candidates[i]
      const b = candidates[j]

      // 硬约束检查（性别 + 黑名单 + 冷却期）
      const constraint = checkHardConstraints(a, b, config, pairRelations)
      if (!constraint.passed) continue

      // 时间检查
      const commonSlots = getCommonSlots(a.availability, b.availability)
      if (commonSlots.length === 0) continue

      // 第一轮排除非双五重复
      const isAvoid = shouldAvoidPair(a, b, pairRelations)
      if (strictAvoid && isAvoid) continue

      // 评分
      const tempA = { ...a, availability: { [commonSlots[0].date]: [commonSlots[0].slot] } }
      const tempB = { ...b, availability: { [commonSlots[0].date]: [commonSlots[0].slot] } }
      const score = scorePair(tempA, tempB, config)
      if (score.hardVeto) continue

      // 双五分重逢加分
      const bonus = getReunionBonus(a, b, pairRelations)

      // 非双五重复在第二轮扣分
      const repeatPenalty = (!strictAvoid && isAvoid) ? -20 : 0

      feasible.push({
        i, j,
        score: { ...score, totalScore: score.totalScore + bonus + repeatPenalty },
        bestSlot: `${commonSlots[0].date}_${commonSlots[0].slot}`,
        bonus,
        isRepeat: isAvoid,
      })
    }
  }

  // 2. 灵活度优先贪心
  const flexibility = new Array(n).fill(0)
  for (const { i, j } of feasible) {
    flexibility[i]++
    flexibility[j]++
  }

  // 按灵活度排序，同灵活度的人用 seed 打乱（产生不同贪心路径）
  const order = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => {
      const diff = flexibility[a] - flexibility[b]
      if (diff !== 0) return diff
      // 同灵活度：用 seed 产生确定性但不同的排列
      return simpleHash(a, seed) - simpleHash(b, seed)
    })

  const matched = new Set<number>()
  const result: typeof feasible = []

  for (const ci of order) {
    if (matched.has(ci)) continue

    const options = feasible
      .filter(({ i, j }) => (i === ci || j === ci) && !matched.has(i === ci ? j : i))
      .sort((a, b) => b.score.totalScore - a.score.totalScore)

    if (options.length === 0) continue

    const best = options[0]
    matched.add(best.i)
    matched.add(best.j)
    result.push(best)
  }

  // 3. 增广路径（2层深度）：拯救未匹配的人
  //    层1: U→M, 拆(M,P), P→X（未匹配的X）
  //    层2: U→M, 拆(M,P), P→Q, 拆(Q,R), R→Y（未匹配的Y）
  //    多次迭代直到无法再救
  for (let augIter = 0; augIter < 10; augIter++) {
    const unmatchedIndices = Array.from({ length: n }, (_, i) => i).filter((i) => !matched.has(i))
    if (unmatchedIndices.length === 0) break

    let rescued = false

    for (const ui of unmatchedIndices) {
      if (matched.has(ui)) continue

      // U 可以和哪些已匹配的人配？
      const uOptions = feasible.filter(
        ({ i, j }) => (i === ui || j === ui) && matched.has(i === ui ? j : i),
      )

      let found = false
      for (const opt of uOptions) {
        if (found) break
        const mi = opt.i === ui ? opt.j : opt.i

        const pairIdx = result.findIndex((r) => r.i === mi || r.j === mi)
        if (pairIdx === -1) continue
        const pi = result[pairIdx].i === mi ? result[pairIdx].j : result[pairIdx].i

        // 层1: P 直接找未匹配的搭档
        const pDirect = feasible.filter(
          ({ i, j }) => (i === pi || j === pi) &&
            (i !== ui && j !== ui) && (i !== mi && j !== mi) &&
            !matched.has(i === pi ? j : i),
        )

        if (pDirect.length > 0) {
          const bestForP = pDirect.sort((a, b) => b.score.totalScore - a.score.totalScore)[0]
          const xi = bestForP.i === pi ? bestForP.j : bestForP.i
          result.splice(pairIdx, 1); matched.delete(pi)
          matched.add(ui); result.push(opt)
          matched.add(xi); result.push(bestForP)
          found = true; rescued = true; break
        }

        // 层2: P 找已匹配的 Q，拆 Q 的搭档 R 找新人
        const pMatched = feasible.filter(
          ({ i, j }) => (i === pi || j === pi) &&
            (i !== ui && j !== ui) && (i !== mi && j !== mi) &&
            matched.has(i === pi ? j : i),
        )

        for (const pOpt of pMatched) {
          const qi = pOpt.i === pi ? pOpt.j : pOpt.i
          const qPairIdx = result.findIndex((r) => r.i === qi || r.j === qi)
          if (qPairIdx === -1 || qPairIdx === pairIdx) continue
          const ri = result[qPairIdx].i === qi ? result[qPairIdx].j : result[qPairIdx].i

          const rOptions = feasible.filter(
            ({ i, j }) => (i === ri || j === ri) &&
              (i !== ui && j !== ui) && (i !== mi && j !== mi) &&
              (i !== pi && j !== pi) && (i !== qi && j !== qi) &&
              !matched.has(i === ri ? j : i),
          )

          if (rOptions.length > 0) {
            const bestForR = rOptions.sort((a, b) => b.score.totalScore - a.score.totalScore)[0]
            const yi = bestForR.i === ri ? bestForR.j : bestForR.i

            // 拆两对，配三对
            // 先删索引大的，避免索引偏移
            const [first, second] = pairIdx > qPairIdx ? [pairIdx, qPairIdx] : [qPairIdx, pairIdx]
            result.splice(first, 1); result.splice(second, 1)
            matched.delete(pi); matched.delete(ri)

            matched.add(ui); result.push(opt)      // U+M
            result.push(pOpt)                       // P+Q (pOpt already has matched pi)
            matched.add(yi); result.push(bestForR)  // R+Y

            found = true; rescued = true; break
          }
        }
      }
    }

    if (!rescued) break
  }

  // 4. 2-opt 优化
  for (let iter = 0; iter < 50; iter++) {
    let improved = false
    for (let p = 0; p < result.length; p++) {
      for (let q = p + 1; q < result.length; q++) {
        const current = result[p].score.totalScore + result[q].score.totalScore

        const swap1 = trySwap(candidates, result[p].i, result[q].i, result[p].j, result[q].j, config, pairRelations, strictAvoid)
        if (swap1 && swap1[0].score.totalScore + swap1[1].score.totalScore > current + 0.01) {
          result[p] = swap1[0]; result[q] = swap1[1]
          improved = true; continue
        }

        const swap2 = trySwap(candidates, result[p].i, result[q].j, result[p].j, result[q].i, config, pairRelations, strictAvoid)
        if (swap2 && swap2[0].score.totalScore + swap2[1].score.totalScore > current + 0.01) {
          result[p] = swap2[0]; result[q] = swap2[1]
          improved = true; continue
        }
      }
    }
    if (!improved) break
  }

  return result.map((r) => ({
    a: candidates[r.i],
    b: candidates[r.j],
    score: r.score,
    bestSlot: r.bestSlot,
    reunionBonus: r.bonus,
    isRepeatPair: r.isRepeat,
  }))
}

/**
 * 最大覆盖多人分组（两轮）
 */
export function runMaxCoverageMultiMatching(
  candidates: MatchCandidate[],
  config: MatchingConfig,
  groupSize: number = 6,
  pairRelations?: Map<string, PairRelation>,
): MultiGroupResult {
  if (candidates.length < 3) {
    return { groups: [], unmatched: [...candidates] }
  }

  // 第一轮：避免重复
  const round1 = runMultiRound(candidates, config, groupSize, pairRelations, true)
  const matched1 = new Set(round1.groups.flatMap((g) => g.members.map((m) => m.submissionId)))
  const unmatched1 = candidates.filter((c) => !matched1.has(c.submissionId))

  // 第二轮：放松重复
  const round2 = unmatched1.length >= 3
    ? runMultiRound(unmatched1, config, groupSize, pairRelations, false)
    : { groups: [], unmatched: unmatched1 }

  return {
    groups: [
      ...round1.groups.map((g) => ({ ...g, hasRepeat: false })),
      ...round2.groups.map((g) => ({ ...g, hasRepeat: true })),
    ],
    unmatched: round2.unmatched,
  }
}

function runMultiRound(
  candidates: MatchCandidate[],
  config: MatchingConfig,
  groupSize: number,
  pairRelations: Map<string, PairRelation> | undefined,
  strictAvoid: boolean,
): { groups: { members: MatchCandidate[]; bestSlot: string; avgScore: number }[]; unmatched: MatchCandidate[] } {
  const n = candidates.length
  const assigned = new Set<number>()
  const groups: { members: MatchCandidate[]; bestSlot: string; avgScore: number }[] = []

  const order = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => {
      const sA = Object.values(candidates[a].availability).reduce((s, v) => s + v.length, 0)
      const sB = Object.values(candidates[b].availability).reduce((s, v) => s + v.length, 0)
      return sA - sB
    })

  for (const seed of order) {
    if (assigned.has(seed)) continue

    const compatible: number[] = []
    for (let j = 0; j < n; j++) {
      if (j === seed || assigned.has(j)) continue
      const common = getCommonSlots(candidates[seed].availability, candidates[j].availability)
      if (common.length === 0) continue
      if (!checkGroupConstraints(candidates[j], [candidates[seed]], config, pairRelations)) continue
      if (strictAvoid && groupHasAvoidPairs(candidates[j], [candidates[seed]], pairRelations)) continue
      compatible.push(j)
    }

    if (compatible.length < 2) continue

    const group = [seed]
    assigned.add(seed)

    while (group.length < groupSize && compatible.length > 0) {
      let bestIdx = -1
      let bestCount = -1

      for (let ci = 0; ci < compatible.length; ci++) {
        const cand = compatible[ci]
        if (assigned.has(cand)) continue

        const groupMembers = group.map((gi) => candidates[gi])

        // 硬约束
        if (!checkGroupConstraints(candidates[cand], groupMembers, config, pairRelations)) continue
        // 第一轮避免重复
        if (strictAvoid && groupHasAvoidPairs(candidates[cand], groupMembers, pairRelations)) continue

        let commonCount = 0
        let commonWithAll = true
        for (const gi of group) {
          const common = getCommonSlots(candidates[cand].availability, candidates[gi].availability)
          if (common.length === 0) { commonWithAll = false; break }
          commonCount += common.length
        }

        if (commonWithAll && commonCount > bestCount) {
          bestCount = commonCount; bestIdx = ci
        }
      }

      if (bestIdx === -1) break
      group.push(compatible[bestIdx])
      assigned.add(compatible[bestIdx])
      compatible.splice(bestIdx, 1)
    }

    if (group.length >= 3) {
      groups.push({
        members: group.map((i) => candidates[i]),
        bestSlot: findGroupBestSlot(group.map((i) => candidates[i])),
        avgScore: 0,
      })
    } else {
      for (const gi of group) assigned.delete(gi)
    }
  }

  return { groups, unmatched: candidates.filter((_, i) => !assigned.has(i)) }
}

// ── 工具函数 ──

function trySwap(
  candidates: MatchCandidate[],
  a: number, b: number, c: number, d: number,
  config: MatchingConfig,
  pairRelations: Map<string, PairRelation> | undefined,
  strictAvoid: boolean,
): [typeof SWAP_RESULT_TYPE, typeof SWAP_RESULT_TYPE] | null {
  const p1 = tryPair(candidates, a, b, config, pairRelations, strictAvoid)
  if (!p1) return null
  const p2 = tryPair(candidates, c, d, config, pairRelations, strictAvoid)
  if (!p2) return null
  return [p1, p2]
}

type SwapResultItem = { i: number; j: number; score: PairScore; bestSlot: string; bonus: number; isRepeat: boolean }
declare const SWAP_RESULT_TYPE: SwapResultItem

function tryPair(
  candidates: MatchCandidate[],
  i: number, j: number,
  config: MatchingConfig,
  pairRelations: Map<string, PairRelation> | undefined,
  strictAvoid: boolean,
): SwapResultItem | null {
  const a = candidates[i], b = candidates[j]

  const constraint = checkHardConstraints(a, b, config, pairRelations)
  if (!constraint.passed) return null

  const common = getCommonSlots(a.availability, b.availability)
  if (common.length === 0) return null

  const isAvoid = shouldAvoidPair(a, b, pairRelations)
  if (strictAvoid && isAvoid) return null

  const tempA = { ...a, availability: { [common[0].date]: [common[0].slot] } }
  const tempB = { ...b, availability: { [common[0].date]: [common[0].slot] } }
  const score = scorePair(tempA, tempB, config)
  if (score.hardVeto) return null

  const bonus = getReunionBonus(a, b, pairRelations)
  const penalty = (!strictAvoid && isAvoid) ? -20 : 0

  return {
    i, j,
    score: { ...score, totalScore: score.totalScore + bonus + penalty },
    bestSlot: `${common[0].date}_${common[0].slot}`,
    bonus,
    isRepeat: isAvoid,
  }
}

function findGroupBestSlot(members: MatchCandidate[]): string {
  for (const [date, slots] of Object.entries(members[0].availability)) {
    for (const slot of slots) {
      if (members.every((m) => m.availability[date]?.includes(slot))) {
        return `${date}_${slot}`
      }
    }
  }
  const counts = new Map<string, number>()
  for (const m of members) {
    for (const [date, slots] of Object.entries(m.availability)) {
      for (const slot of slots) {
        const key = `${date}_${slot}`
        counts.set(key, (counts.get(key) || 0) + 1)
      }
    }
  }
  let best = "未知时段"; let bestN = 0
  for (const [k, v] of counts) { if (v > bestN) { best = k; bestN = v } }
  return best
}

function emptyResult(candidates: MatchCandidate[]): MaxMatchResult {
  return {
    pairs: [],
    unmatched: [...candidates],
    metadata: { candidateCount: candidates.length, pairCount: 0, averageScore: 0, round1Pairs: 0, round2Pairs: 0, reunionPairs: 0 },
  }
}

/** 简单确定性哈希，让同灵活度的人在不同 seed 下产生不同排列 */
function simpleHash(index: number, seed: number): number {
  let h = (index * 2654435761 + seed * 40503) | 0
  h = ((h >>> 16) ^ h) * 0x45d9f3b | 0
  h = ((h >>> 16) ^ h) | 0
  return h
}
