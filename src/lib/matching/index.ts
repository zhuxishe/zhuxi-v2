/**
 * 竹溪社首轮匹配 — 主入口
 */

export { scorePair } from "./scorer"
export { checkHardConstraints } from "./constraints"
export { groupByTimeSlot, getCommonSlots, hasCommonSlot, getAvailabilityHeatmap } from "./time-filter"
export { jaccard, complementScore } from "./similarity"
export { DEFAULT_CONFIG } from "./config"
export type * from "./types"

import type {
  MatchCandidate,
  MatchingConfig,
  PairScore,
  MatchAssignment,
  AssignedPair,
} from "./types"
import { scorePair } from "./scorer"

/**
 * 运行双人匹配算法（贪心 + 2-opt）
 */
export function runDuoMatching(
  candidates: MatchCandidate[],
  config: MatchingConfig,
  algorithm: "optimized" | "greedy" = "optimized",
): MatchAssignment {
  const n = candidates.length

  if (n < 2) {
    return emptyResult(candidates, algorithm)
  }

  // 1. 构建评分矩阵
  const scores: PairScore[][] = []
  for (let i = 0; i < n; i++) {
    scores[i] = []
    for (let j = 0; j < n; j++) {
      if (i === j) {
        scores[i][j] = selfScore(candidates[i])
      } else if (j > i) {
        scores[i][j] = scorePair(candidates[i], candidates[j], config)
      } else {
        scores[i][j] = scores[j][i]
      }
    }
  }

  // 2. 贪心匹配
  let pairIndices = greedyMatching(n, scores)

  // 3. 2-opt 优化
  if (algorithm === "optimized" && pairIndices.length >= 2) {
    pairIndices = twoOptImprove(pairIndices, scores)
  }

  // 4. 构建结果
  return buildResult(candidates, pairIndices, scores, algorithm)
}

/**
 * 运行多人分组算法（贪心，3-6人）
 */
export function runMultiMatching(
  candidates: MatchCandidate[],
  config: MatchingConfig,
  groupSize: number = 6,
): { groups: { members: MatchCandidate[]; avgScore: number }[]; unmatched: MatchCandidate[] } {
  if (candidates.length < 3) {
    return { groups: [], unmatched: [...candidates] }
  }

  // 构建评分矩阵
  const n = candidates.length
  const scores: number[][] = []
  for (let i = 0; i < n; i++) {
    scores[i] = []
    for (let j = 0; j < n; j++) {
      if (i === j) {
        scores[i][j] = 0
      } else if (j > i) {
        const ps = scorePair(candidates[i], candidates[j], config)
        scores[i][j] = ps.hardVeto ? -1 : ps.totalScore
      } else {
        scores[i][j] = scores[j][i]
      }
    }
  }

  // 贪心分组
  const groups: { members: MatchCandidate[]; avgScore: number }[] = []
  const assigned = new Set<number>()

  while (assigned.size < n) {
    const remaining = Array.from({ length: n }, (_, i) => i).filter((i) => !assigned.has(i))
    if (remaining.length < 3) break

    const targetSize = Math.min(groupSize, remaining.length)

    // 选种子: 找最高兼容度的一对
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

    // 逐个添加最兼容的成员
    while (group.length < targetSize) {
      const pool = remaining.filter((i) => !assigned.has(i))
      if (pool.length === 0) break

      let bestCandidate = pool[0]
      let bestAvg = -Infinity
      for (const ci of pool) {
        // 计算ci与当前组所有成员的平均兼容度
        const avgScore = group.reduce((sum, gi) => sum + Math.max(0, scores[ci][gi]), 0) / group.length
        if (avgScore > bestAvg) {
          bestAvg = avgScore
          bestCandidate = ci
        }
      }

      group.push(bestCandidate)
      assigned.add(bestCandidate)
    }

    // 计算组平均分
    let totalPairScore = 0
    let pairCount = 0
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        totalPairScore += Math.max(0, scores[group[i]][group[j]])
        pairCount++
      }
    }

    groups.push({
      members: group.map((i) => candidates[i]),
      avgScore: pairCount > 0 ? totalPairScore / pairCount : 0,
    })
  }

  const unmatchedIndices = Array.from({ length: n }, (_, i) => i).filter((i) => !assigned.has(i))
  return {
    groups,
    unmatched: unmatchedIndices.map((i) => candidates[i]),
  }
}

// ── 内部工具函数 ──

function selfScore(c: MatchCandidate): PairScore {
  return {
    userA: c.submissionId,
    userB: c.submissionId,
    totalScore: 0,
    breakdown: [],
    hardVeto: true,
    vetoReasons: ["self"],
    explanationZh: "",
  }
}

function emptyResult(candidates: MatchCandidate[], algorithm: "optimized" | "greedy"): MatchAssignment {
  return {
    pairs: [],
    unmatched: candidates.map((c) => c.submissionId),
    totalScore: 0,
    metadata: {
      candidateCount: candidates.length,
      pairCount: 0,
      averageScore: 0,
      minScore: 0,
      maxScore: 0,
      algorithmUsed: algorithm,
    },
  }
}

function greedyMatching(n: number, scores: PairScore[][]): [number, number][] {
  const allPairs: { i: number; j: number; score: number }[] = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!scores[i][j].hardVeto) {
        allPairs.push({ i, j, score: scores[i][j].totalScore })
      }
    }
  }
  allPairs.sort((a, b) => b.score - a.score)

  const matched = new Set<number>()
  const result: [number, number][] = []

  for (const { i, j } of allPairs) {
    if (matched.has(i) || matched.has(j)) continue
    result.push([i, j])
    matched.add(i)
    matched.add(j)
  }

  return result
}

function twoOptImprove(
  pairs: [number, number][],
  scores: PairScore[][],
  maxIterations: number = 100,
): [number, number][] {
  const result = pairs.map(([a, b]) => [a, b] as [number, number])

  for (let iter = 0; iter < maxIterations; iter++) {
    let improved = false
    for (let p = 0; p < result.length; p++) {
      for (let q = p + 1; q < result.length; q++) {
        const [a, b] = result[p]
        const [c, d] = result[q]
        const current = scores[a][b].totalScore + scores[c][d].totalScore

        if (!scores[a][c].hardVeto && !scores[b][d].hardVeto) {
          const swap1 = scores[a][c].totalScore + scores[b][d].totalScore
          if (swap1 > current + 0.01) {
            result[p] = [Math.min(a, c), Math.max(a, c)]
            result[q] = [Math.min(b, d), Math.max(b, d)]
            improved = true
            continue
          }
        }

        if (!scores[a][d].hardVeto && !scores[b][c].hardVeto) {
          const swap2 = scores[a][d].totalScore + scores[b][c].totalScore
          if (swap2 > current + 0.01) {
            result[p] = [Math.min(a, d), Math.max(a, d)]
            result[q] = [Math.min(b, c), Math.max(b, c)]
            improved = true
            continue
          }
        }
      }
    }
    if (!improved) break
  }

  return result
}

function buildResult(
  candidates: MatchCandidate[],
  pairIndices: [number, number][],
  scores: PairScore[][],
  algorithm: "optimized" | "greedy",
): MatchAssignment {
  const pairs: AssignedPair[] = pairIndices
    .map(([i, j]) => ({
      userA: candidates[i].submissionId,
      userB: candidates[j].submissionId,
      score: scores[i][j],
      rank: 0,
    }))
    .sort((a, b) => b.score.totalScore - a.score.totalScore)

  pairs.forEach((p, idx) => { p.rank = idx + 1 })

  const matchedIds = new Set(pairs.flatMap((p) => [p.userA, p.userB]))
  const unmatched = candidates
    .map((c) => c.submissionId)
    .filter((id) => !matchedIds.has(id))

  const totalScore = pairs.reduce((sum, p) => sum + p.score.totalScore, 0)
  const pairScores = pairs.map((p) => p.score.totalScore)

  return {
    pairs,
    unmatched,
    totalScore,
    metadata: {
      candidateCount: candidates.length,
      pairCount: pairs.length,
      averageScore: pairs.length > 0 ? totalScore / pairs.length : 0,
      minScore: pairScores.length > 0 ? Math.min(...pairScores) : 0,
      maxScore: pairScores.length > 0 ? Math.max(...pairScores) : 0,
      algorithmUsed: algorithm,
    },
  }
}
