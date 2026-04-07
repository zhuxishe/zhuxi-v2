/**
 * 双人匹配内部工具函数
 */

import type {
  MatchCandidate,
  PairScore,
  MatchAssignment,
  AssignedPair,
} from "./types"

export function selfScore(c: MatchCandidate): PairScore {
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

export function emptyDuoResult(candidates: MatchCandidate[], algorithm: "optimized" | "greedy"): MatchAssignment {
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

export function greedyMatching(n: number, scores: PairScore[][]): [number, number][] {
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

export function twoOptImprove(
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

export function buildResult(
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
