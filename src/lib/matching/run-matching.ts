/** Coverage-first matching: disjoint duos and at most one shared multiplayer pool. */
import type { MatchCandidate, MatchingConfig, MultiPoolScoreBreakdown } from "./types"
import type { PairRelation } from "./pair-history"
import { findCoveragePlan, type CoverageOptions } from "./coverage-plan"
import { scorePairFactors } from "./scorer"
import { pairActivityFeedback } from "./score-v3"

export interface MatchResultRow {
  member_a_id: string
  member_b_id: string | null
  group_members: string[] | null
  total_score: number
  score_breakdown: unknown
  rank: number
  best_slot: string | null
  game_type: string
}
export interface RunResult {
  rows: MatchResultRow[]
  totalCandidates: number
  totalMatched: number
  totalUnmatched: number
  unmatchedIds: string[]
}

/** Explanations only: pool selection keeps its existing mean-pair objective. */
export function describeMultiPool(members: MatchCandidate[], config: MatchingConfig): MultiPoolScoreBreakdown {
  const components = new Map<string, { factor: ReturnType<typeof scorePairFactors>["breakdown"][number]; raw: number; weighted: number }>()
  const memberTotals = members.map(() => 0)
  const distribution = { below40: 0, from40to60: 0, from60to80: 0, atLeast80: 0 }
  let pairCount = 0, feedbackPairCount = 0
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
    const score = scorePairFactors(members[i], members[j], config)
    pairCount++
    memberTotals[i] += score.totalScore; memberTotals[j] += score.totalScore
    if (score.totalScore < 40) distribution.below40++
    else if (score.totalScore < 60) distribution.from40to60++
    else if (score.totalScore < 80) distribution.from60to80++
    else distribution.atLeast80++
    if (pairActivityFeedback(members[i].submissionId, members[j].submissionId, config.scoringPolicy!).hasFeedback) feedbackPairCount++
    for (const factor of score.breakdown) {
      const current = components.get(factor.factor) ?? { factor, raw: 0, weighted: 0 }
      current.raw += factor.rawScore; current.weighted += factor.weightedScore
      components.set(factor.factor, current)
    }
  }
  const averages = memberTotals.map((sum) => sum / (members.length - 1))
  const min = Math.min(...averages), max = Math.max(...averages)
  return { kind: "multi_pool", version: "weighted_feedback:1", pairCount, feedbackPairCount,
    factors: [...components.values()].map(({ factor, raw, weighted }) => ({ ...factor,
      rawScore: raw / pairCount, weightedScore: weighted / pairCount,
      detail: `整池 ${pairCount} 对成员的${factor.label}平均分` })),
    minimumMemberAverage: min,
    memberAverageDistribution: { min, max, mean: averages.reduce((sum, score) => sum + score, 0) / averages.length },
    pairScoreDistribution: distribution, historyAdjustment: 0 }
}
/** Saved input order supplies deterministic choices when all objectives tie. */
export function runFullMatching(
  candidates: MatchCandidate[],
  config: MatchingConfig,
  idMap: Map<string, string>,
  pairRelations?: Map<string, PairRelation>,
  options: CoverageOptions = {},
): RunResult {
  const plan = findCoveragePlan(candidates, config, pairRelations, options)
  const resolve = (i: number) => idMap.get(candidates[i].submissionId) ?? candidates[i].submissionId
  const matched = new Set<number>()
  const rows: MatchResultRow[] = plan.duos.map((pair, index) => {
    matched.add(pair.i); matched.add(pair.j)
    return {
      member_a_id: resolve(pair.i), member_b_id: resolve(pair.j), group_members: null,
      total_score: pair.score.totalScore, score_breakdown: pair.score.breakdown, rank: index + 1,
      best_slot: pair.bestSlot || null,
      game_type: pair.bonus > 0 ? "双人(重逢)" : pair.isRepeat ? "双人(重复)" : "双人",
    }
  })
  if (plan.multi.length) {
    for (const i of plan.multi) matched.add(i)
    const ids = plan.multi.map(resolve)
    rows.push({ member_a_id: ids[0], member_b_id: null, group_members: ids,
      total_score: plan.multiScore,
      score_breakdown: config.scoringPolicy ? describeMultiPool(plan.multi.map((i) => candidates[i]), config) : null,
      rank: rows.length + 1,
      best_slot: plan.multiBestSlot, game_type: plan.multiHasRepeat ? "多人(重复)" : "多人" })
  }
  const unmatchedIds = candidates.flatMap((candidate, i) => matched.has(i) ? [] : [candidate.submissionId])
  return { rows, totalCandidates: candidates.length, totalMatched: matched.size, totalUnmatched: unmatchedIds.length, unmatchedIds }
}
