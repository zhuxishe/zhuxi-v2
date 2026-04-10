/**
 * 多人分组算法（贪心，3-6人）
 */

import type { MatchCandidate, MatchingConfig } from "./types"
import type { PairRelation } from "./pair-history"
import { scorePair } from "./scorer"

/**
 * 运行多人分组算法
 */
export function runMultiMatching(
  candidates: MatchCandidate[],
  config: MatchingConfig,
  groupSize: number = 6,
  pairRelations?: Map<string, PairRelation>,
): { groups: { members: MatchCandidate[]; avgScore: number }[]; unmatched: MatchCandidate[] } {
  if (candidates.length < 3) {
    return { groups: [], unmatched: [...candidates] }
  }

  const n = candidates.length
  const scores: number[][] = []
  for (let i = 0; i < n; i++) {
    scores[i] = []
    for (let j = 0; j < n; j++) {
      if (i === j) {
        scores[i][j] = 0
      } else if (j > i) {
        const ps = scorePair(candidates[i], candidates[j], config, pairRelations)
        scores[i][j] = ps.hardVeto ? -1 : ps.totalScore
      } else {
        scores[i][j] = scores[j][i]
      }
    }
  }

  const groups: { members: MatchCandidate[]; avgScore: number }[] = []
  const assigned = new Set<number>()

  while (assigned.size < n) {
    const remaining = Array.from({ length: n }, (_, i) => i).filter((i) => !assigned.has(i))
    if (remaining.length < 3) break

    const targetSize = Math.min(groupSize, remaining.length)
    const group = buildGroup(remaining, scores, assigned, targetSize)
    if (!group) break

    const avgScore = calcGroupAvgScore(group, scores)
    groups.push({
      members: group.map((i) => candidates[i]),
      avgScore,
    })
  }

  const unmatchedIndices = Array.from({ length: n }, (_, i) => i).filter((i) => !assigned.has(i))
  return {
    groups,
    unmatched: unmatchedIndices.map((i) => candidates[i]),
  }
}

function buildGroup(
  remaining: number[],
  scores: number[][],
  assigned: Set<number>,
  targetSize: number,
): number[] | null {
  // Find best seed pair
  let bestPair: [number, number] = [remaining[0], remaining[1]]
  let bestScore = -Infinity
  for (let i = 0; i < remaining.length; i++) {
    for (let j = i + 1; j < remaining.length; j++) {
      if (scores[remaining[i]][remaining[j]] > bestScore) {
        bestScore = scores[remaining[i]][remaining[j]]
        bestPair = [remaining[i], remaining[j]]
      }
    }
  }

  const group = [bestPair[0], bestPair[1]]
  assigned.add(bestPair[0])
  assigned.add(bestPair[1])

  while (group.length < targetSize) {
    const pool = remaining.filter((i) => !assigned.has(i))
    if (pool.length === 0) break

    let bestCandidate = pool[0]
    let bestAvg = -Infinity
    for (const ci of pool) {
      const avgScore = group.reduce((sum, gi) => sum + Math.max(0, scores[ci][gi]), 0) / group.length
      if (avgScore > bestAvg) {
        bestAvg = avgScore
        bestCandidate = ci
      }
    }

    group.push(bestCandidate)
    assigned.add(bestCandidate)
  }

  return group
}

function calcGroupAvgScore(group: number[], scores: number[][]): number {
  let totalPairScore = 0
  let pairCount = 0
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      totalPairScore += Math.max(0, scores[group[i]][group[j]])
      pairCount++
    }
  }
  return pairCount > 0 ? totalPairScore / pairCount : 0
}
