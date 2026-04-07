/**
 * 最大覆盖匹配算法 v2 — 入口
 *
 * 两轮匹配：
 * 第一轮（严格）：排除黑名单+冷却期+非双五重复，双五重逢加分
 * 第二轮（放松重复）：仅对第一轮未配上的人，允许非双五重复（但扣分）
 *
 * 核心思想：灵活度低的人优先匹配
 */

import type { MatchCandidate, MatchingConfig, PairScore } from "./types"
import type { PairRelation } from "./pair-history"
import { emptyResult } from "./match-utils"
import { buildFeasiblePairs, greedySelect, augmentPaths } from "./greedy-matching"
import { twoOptOptimize } from "./two-opt"

// Re-export sub-modules for backward compatibility
export { runMaxCoverageMultiMatching } from "./multi-group"
export type { MultiGroupResult } from "./multi-group"

export interface MaxMatchPair {
  a: MatchCandidate
  b: MatchCandidate
  score: PairScore
  bestSlot: string
  reunionBonus: number
  isRepeatPair: boolean
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

const MAX_ATTEMPTS = 20

/**
 * 最大覆盖双人匹配
 * 自动多次尝试（最多 MAX_ATTEMPTS 次），取未匹配人数最少的结果。
 */
export function runMaxCoverageDuoMatching(
  candidates: MatchCandidate[],
  config: MatchingConfig,
  pairRelations?: Map<string, PairRelation>,
): MaxMatchResult {
  const n = candidates.length
  if (n < 2) return emptyResult(candidates)

  let bestResult: MaxMatchResult | null = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = runSingleAttempt(candidates, config, pairRelations, attempt)
    if (result.unmatched.length === 0) return result

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
  const round1Pairs = runRound(candidates, config, pairRelations, true, seed)

  const matched1 = new Set<string>()
  for (const p of round1Pairs) {
    matched1.add(p.a.submissionId)
    matched1.add(p.b.submissionId)
  }

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

function runRound(
  candidates: MatchCandidate[],
  config: MatchingConfig,
  pairRelations: Map<string, PairRelation> | undefined,
  strictAvoid: boolean,
  seed: number = 0,
): MaxMatchPair[] {
  const n = candidates.length
  const feasible = buildFeasiblePairs(candidates, config, pairRelations, strictAvoid)
  const { matched, result } = greedySelect(n, feasible, seed)

  augmentPaths(n, feasible, matched, result)
  twoOptOptimize(result, candidates, config, pairRelations, strictAvoid)

  return result.map((r) => ({
    a: candidates[r.i],
    b: candidates[r.j],
    score: r.score,
    bestSlot: r.bestSlot,
    reunionBonus: r.bonus,
    isRepeatPair: r.isRepeat,
  }))
}
