/** Coverage-first matching: disjoint duos and at most one shared multiplayer pool. */
import type { MatchCandidate, MatchingConfig } from "./types"
import type { PairRelation } from "./pair-history"
import { findCoveragePlan } from "./coverage-plan"

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
interface RunResult {
  rows: MatchResultRow[]
  totalCandidates: number
  totalMatched: number
  totalUnmatched: number
  unmatchedIds: string[]
}
/** Saved input order supplies deterministic choices when all objectives tie. */
export function runFullMatching(
  candidates: MatchCandidate[],
  config: MatchingConfig,
  idMap: Map<string, string>,
  pairRelations?: Map<string, PairRelation>,
): RunResult {
  const plan = findCoveragePlan(candidates, config, pairRelations)
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
      total_score: plan.multiScore, score_breakdown: null, rank: rows.length + 1,
      best_slot: plan.multiBestSlot, game_type: plan.multiHasRepeat ? "多人(重复)" : "多人" })
  }
  const unmatchedIds = candidates.flatMap((candidate, i) => matched.has(i) ? [] : [candidate.submissionId])
  return { rows, totalCandidates: candidates.length, totalMatched: matched.size, totalUnmatched: unmatchedIds.length, unmatchedIds }
}
