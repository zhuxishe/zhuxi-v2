/**
 * 匹配算法共享工具函数和类型
 */

import type { MatchCandidate, MatchingConfig, PairScore } from "./types"
import type { PairRelation } from "./pair-history"
import { scorePair } from "./scorer"
import { getCommonSlots } from "./time-filter"
import {
  checkHardConstraints,
  shouldAvoidPair,
  getReunionBonus,
} from "./constraints"
import type { MaxMatchPair, MaxMatchResult } from "./max-match"

export interface FeasiblePair {
  i: number
  j: number
  score: PairScore
  bestSlot: string
  bonus: number
  isRepeat: boolean
}

/** 简单确定性哈希，让同灵活度的人在不同 seed 下产生不同排列 */
export function simpleHash(index: number, seed: number): number {
  let h = (index * 2654435761 + seed * 40503) | 0
  h = ((h >>> 16) ^ h) * 0x45d9f3b | 0
  h = ((h >>> 16) ^ h) | 0
  return h
}

export function emptyResult(candidates: MatchCandidate[]): MaxMatchResult {
  return {
    pairs: [],
    unmatched: [...candidates],
    metadata: { candidateCount: candidates.length, pairCount: 0, averageScore: 0, round1Pairs: 0, round2Pairs: 0, reunionPairs: 0 },
  }
}

/** 尝试交换两对，返回新配对或 null */
export function trySwap(
  candidates: MatchCandidate[],
  a: number, b: number, c: number, d: number,
  config: MatchingConfig,
  pairRelations: Map<string, PairRelation> | undefined,
  strictAvoid: boolean,
): [FeasiblePair, FeasiblePair] | null {
  const p1 = tryPair(candidates, a, b, config, pairRelations, strictAvoid)
  if (!p1) return null
  const p2 = tryPair(candidates, c, d, config, pairRelations, strictAvoid)
  if (!p2) return null
  return [p1, p2]
}

/** 尝试配对两人 */
export function tryPair(
  candidates: MatchCandidate[],
  i: number, j: number,
  config: MatchingConfig,
  pairRelations: Map<string, PairRelation> | undefined,
  strictAvoid: boolean,
): FeasiblePair | null {
  const a = candidates[i], b = candidates[j]

  const constraint = checkHardConstraints(a, b, config, pairRelations)
  if (!constraint.passed) return null

  const common = getCommonSlots(a.availability, b.availability)
  if (common.length === 0) return null

  const isAvoid = shouldAvoidPair(a, b, pairRelations)
  if (strictAvoid && isAvoid) return null

  const tempA = { ...a, availability: { [common[0].date]: [common[0].slot] } }
  const tempB = { ...b, availability: { [common[0].date]: [common[0].slot] } }
  const score = scorePair(tempA, tempB, config, pairRelations)
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

/** 找组内最佳公共时段 */
export function findGroupBestSlot(members: MatchCandidate[]): string {
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
