/**
 * 2-opt 优化 — 对已有配对进行交换尝试以提升总分
 */

import type { MatchCandidate, MatchingConfig } from "./types"
import type { PairRelation } from "./pair-history"
import type { FeasiblePair } from "./match-utils"
import { trySwap } from "./match-utils"

/**
 * 对匹配结果进行 2-opt 局部搜索优化
 *
 * 反复尝试交换两对配对中的成员，如果总分提升则接受。
 * 最多迭代 maxIterations 次。
 */
export function twoOptOptimize(
  result: FeasiblePair[],
  candidates: MatchCandidate[],
  config: MatchingConfig,
  pairRelations: Map<string, PairRelation> | undefined,
  strictAvoid: boolean,
  maxIterations: number = 50,
): void {
  for (let iter = 0; iter < maxIterations; iter++) {
    let improved = false
    for (let p = 0; p < result.length; p++) {
      for (let q = p + 1; q < result.length; q++) {
        const current = result[p].score.totalScore + result[q].score.totalScore

        const swap1 = trySwap(
          candidates, result[p].i, result[q].i, result[p].j, result[q].j,
          config, pairRelations, strictAvoid,
        )
        if (swap1 && swap1[0].score.totalScore + swap1[1].score.totalScore > current + 0.01) {
          result[p] = swap1[0]; result[q] = swap1[1]
          improved = true; continue
        }

        const swap2 = trySwap(
          candidates, result[p].i, result[q].j, result[p].j, result[q].i,
          config, pairRelations, strictAvoid,
        )
        if (swap2 && swap2[0].score.totalScore + swap2[1].score.totalScore > current + 0.01) {
          result[p] = swap2[0]; result[q] = swap2[1]
          improved = true; continue
        }
      }
    }
    if (!improved) break
  }
}
