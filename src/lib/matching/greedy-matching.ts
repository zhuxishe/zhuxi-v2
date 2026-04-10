/**
 * 贪心匹配 — 构建可行配对 + 灵活度优先贪心选择
 */

import type { MatchCandidate, MatchingConfig } from "./types"
import type { PairRelation } from "./pair-history"
import { scorePair } from "./scorer"
import { getCommonSlots } from "./time-filter"
import {
  checkHardConstraints,
  shouldAvoidPair,
  getReunionBonus,
} from "./constraints"
import { simpleHash } from "./match-utils"
import type { FeasiblePair } from "./match-utils"

// Re-export augmentPaths for consumers
export { augmentPaths } from "./augment-path"

/**
 * 构建可行配对列表
 */
export function buildFeasiblePairs(
  candidates: MatchCandidate[],
  config: MatchingConfig,
  pairRelations: Map<string, PairRelation> | undefined,
  strictAvoid: boolean,
): FeasiblePair[] {
  const n = candidates.length
  const feasible: FeasiblePair[] = []

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = candidates[i]
      const b = candidates[j]

      const constraint = checkHardConstraints(a, b, config, pairRelations)
      if (!constraint.passed) continue

      const commonSlots = getCommonSlots(a.availability, b.availability)
      if (commonSlots.length === 0) continue

      const isAvoid = shouldAvoidPair(a, b, pairRelations)
      if (strictAvoid && isAvoid) continue

      const tempA = { ...a, availability: { [commonSlots[0].date]: [commonSlots[0].slot] } }
      const tempB = { ...b, availability: { [commonSlots[0].date]: [commonSlots[0].slot] } }
      const score = scorePair(tempA, tempB, config, pairRelations)
      if (score.hardVeto) continue

      const bonus = getReunionBonus(a, b, pairRelations)
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

  return feasible
}

/**
 * 灵活度优先贪心选择
 */
export function greedySelect(
  n: number,
  feasible: FeasiblePair[],
  seed: number,
): { matched: Set<number>; result: FeasiblePair[] } {
  const flexibility = new Array(n).fill(0)
  for (const { i, j } of feasible) {
    flexibility[i]++
    flexibility[j]++
  }

  const order = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => {
      const diff = flexibility[a] - flexibility[b]
      if (diff !== 0) return diff
      return simpleHash(a, seed) - simpleHash(b, seed)
    })

  const matched = new Set<number>()
  const result: FeasiblePair[] = []

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

  return { matched, result }
}
