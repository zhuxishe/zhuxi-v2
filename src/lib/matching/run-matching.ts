/**
 * 匹配分流调度器 — 照搬旧项目 zhuxi-matching 的三阶段逻辑
 *
 * 1. 双人池 = 偏好"双人" + "都可以" → runMaxCoverageDuoMatching
 * 2. 多人池 = 偏好"多人" + 未配的"都可以" → runMaxCoverageMultiMatching
 * 3. 回流兜底 = 所有剩余 → runMaxCoverageDuoMatching
 */

import type { MatchCandidate, MatchingConfig } from "./types"
import type { PairRelation } from "./pair-history"
import { runMaxCoverageDuoMatching, runMaxCoverageMultiMatching } from "./max-match"
import type { MaxMatchPair } from "./max-match"

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
}

/**
 * 三阶段分流匹配
 * @param candidates 所有候选人
 * @param config 匹配配置
 * @param idMap submissionId → memberId 映射
 * @param pairRelations 配对历史关系（可选）
 */
export function runFullMatching(
  candidates: MatchCandidate[],
  config: MatchingConfig,
  idMap: Map<string, string>,
  pairRelations?: Map<string, PairRelation>,
): RunResult {
  const matched = new Set<string>()
  const rows: MatchResultRow[] = []
  let rank = 0

  const resolve = (subId: string) => idMap.get(subId) ?? subId

  // ── 分流 ──
  const duo: MatchCandidate[] = []
  const multi: MatchCandidate[] = []
  const either: MatchCandidate[] = []
  for (const c of candidates) {
    if (c.gameTypePref === "双人") duo.push(c)
    else if (c.gameTypePref === "多人") multi.push(c)
    else either.push(c)
  }

  // ── 阶段1: 双人池 ──
  const duoPool = [...duo, ...either]
  if (duoPool.length >= 2) {
    const result = runMaxCoverageDuoMatching(duoPool, config, pairRelations)
    for (const pair of result.pairs) {
      matched.add(pair.a.submissionId)
      matched.add(pair.b.submissionId)
      rows.push(pairToRow(pair, resolve, ++rank, labelDuo(pair)))
    }
  }

  // ── 阶段2: 多人池 ──
  const multiPool = [
    ...multi.filter((c) => !matched.has(c.submissionId)),
    ...either.filter((c) => !matched.has(c.submissionId)),
  ]
  if (multiPool.length >= 3) {
    const result = runMaxCoverageMultiMatching(multiPool, config, 6, pairRelations)
    for (const g of result.groups) {
      for (const m of g.members) matched.add(m.submissionId)
      const ids = g.members.map((m) => resolve(m.submissionId))
      rows.push({
        member_a_id: ids[0],
        member_b_id: null,
        group_members: ids,
        total_score: g.avgScore,
        score_breakdown: null,
        rank: ++rank,
        best_slot: g.bestSlot || null,
        game_type: g.hasRepeat ? "多人(重复)" : "多人",
      })
    }
  }

  // ── 阶段3: 回流兜底 ──
  const overflow = candidates.filter((c) => !matched.has(c.submissionId))
  if (overflow.length >= 2) {
    const result = runMaxCoverageDuoMatching(overflow, config, pairRelations)
    for (const pair of result.pairs) {
      matched.add(pair.a.submissionId)
      matched.add(pair.b.submissionId)
      const gt = pair.isRepeatPair ? "双人(回流+重复)" : "双人(回流)"
      rows.push(pairToRow(pair, resolve, ++rank, gt))
    }
  }

  return {
    rows,
    totalCandidates: candidates.length,
    totalMatched: matched.size,
    totalUnmatched: candidates.length - matched.size,
  }
}

function pairToRow(
  pair: MaxMatchPair,
  resolve: (id: string) => string,
  rank: number,
  gameType: string,
): MatchResultRow {
  return {
    member_a_id: resolve(pair.a.submissionId),
    member_b_id: resolve(pair.b.submissionId),
    group_members: null,
    total_score: pair.score.totalScore,
    score_breakdown: pair.score.breakdown,
    rank,
    best_slot: pair.bestSlot || null,
    game_type: gameType,
  }
}

function labelDuo(pair: MaxMatchPair): string {
  if (pair.reunionBonus > 0) return "双人(重逢)"
  if (pair.isRepeatPair) return "双人(重复)"
  return "双人"
}
