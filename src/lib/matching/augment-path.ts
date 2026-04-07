/**
 * 增广路径算法 — 拯救贪心匹配中未配上的人
 *
 * 层1: U→M, 拆(M,P), P→X（未匹配的X）
 * 层2: U→M, 拆(M,P), P→Q, 拆(Q,R), R→Y（未匹配的Y）
 */

import type { FeasiblePair } from "./match-utils"

/**
 * 增广路径（2层深度）：拯救未匹配的人
 * 多次迭代直到无法再救
 */
export function augmentPaths(
  n: number,
  feasible: FeasiblePair[],
  matched: Set<number>,
  result: FeasiblePair[],
): void {
  for (let augIter = 0; augIter < 10; augIter++) {
    const unmatchedIndices = Array.from({ length: n }, (_, i) => i).filter((i) => !matched.has(i))
    if (unmatchedIndices.length === 0) break

    let rescued = false

    for (const ui of unmatchedIndices) {
      if (matched.has(ui)) continue

      const uOptions = feasible.filter(
        ({ i, j }) => (i === ui || j === ui) && matched.has(i === ui ? j : i),
      )

      let found = false
      for (const opt of uOptions) {
        if (found) break
        const mi = opt.i === ui ? opt.j : opt.i

        const pairIdx = result.findIndex((r) => r.i === mi || r.j === mi)
        if (pairIdx === -1) continue
        const pi = result[pairIdx].i === mi ? result[pairIdx].j : result[pairIdx].i

        // Layer 1: P finds unmatched partner directly
        const pDirect = feasible.filter(
          ({ i, j }) => (i === pi || j === pi) &&
            (i !== ui && j !== ui) && (i !== mi && j !== mi) &&
            !matched.has(i === pi ? j : i),
        )

        if (pDirect.length > 0) {
          const bestForP = pDirect.sort((a, b) => b.score.totalScore - a.score.totalScore)[0]
          const xi = bestForP.i === pi ? bestForP.j : bestForP.i
          result.splice(pairIdx, 1); matched.delete(pi)
          matched.add(ui); result.push(opt)
          matched.add(xi); result.push(bestForP)
          found = true; rescued = true; break
        }

        // Layer 2
        found = tryLayer2Augment(ui, mi, pi, pairIdx, feasible, matched, result)
        if (found) { rescued = true; break }
      }
    }

    if (!rescued) break
  }
}

function tryLayer2Augment(
  ui: number, mi: number, pi: number, pairIdx: number,
  feasible: FeasiblePair[], matched: Set<number>, result: FeasiblePair[],
): boolean {
  const opt = feasible.find(
    ({ i, j }) => (i === ui || j === ui) && (i === mi || j === mi),
  )
  if (!opt) return false

  const pMatched = feasible.filter(
    ({ i, j }) => (i === pi || j === pi) &&
      (i !== ui && j !== ui) && (i !== mi && j !== mi) &&
      matched.has(i === pi ? j : i),
  )

  for (const pOpt of pMatched) {
    const qi = pOpt.i === pi ? pOpt.j : pOpt.i
    const qPairIdx = result.findIndex((r) => r.i === qi || r.j === qi)
    if (qPairIdx === -1 || qPairIdx === pairIdx) continue
    const ri = result[qPairIdx].i === qi ? result[qPairIdx].j : result[qPairIdx].i

    const rOptions = feasible.filter(
      ({ i, j }) => (i === ri || j === ri) &&
        (i !== ui && j !== ui) && (i !== mi && j !== mi) &&
        (i !== pi && j !== pi) && (i !== qi && j !== qi) &&
        !matched.has(i === ri ? j : i),
    )

    if (rOptions.length > 0) {
      const bestForR = rOptions.sort((a, b) => b.score.totalScore - a.score.totalScore)[0]
      const yi = bestForR.i === ri ? bestForR.j : bestForR.i

      const [first, second] = pairIdx > qPairIdx ? [pairIdx, qPairIdx] : [qPairIdx, pairIdx]
      result.splice(first, 1); result.splice(second, 1)
      matched.delete(pi); matched.delete(ri)

      matched.add(ui); result.push(opt)
      result.push(pOpt)
      matched.add(yi); result.push(bestForR)

      return true
    }
  }

  return false
}
