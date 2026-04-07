/**
 * 双人匹配算法（贪心 + 2-opt）
 */

import type {
  MatchCandidate,
  MatchingConfig,
  PairScore,
  MatchAssignment,
} from "./types"
import { scorePair } from "./scorer"
import {
  selfScore,
  emptyDuoResult,
  greedyMatching,
  twoOptImprove,
  buildResult,
} from "./duo-helpers"

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
    return emptyDuoResult(candidates, algorithm)
  }

  // 构建评分矩阵
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

  // 贪心匹配
  let pairIndices = greedyMatching(n, scores)

  // 2-opt 优化
  if (algorithm === "optimized" && pairIndices.length >= 2) {
    pairIndices = twoOptImprove(pairIndices, scores)
  }

  return buildResult(candidates, pairIndices, scores, algorithm)
}
