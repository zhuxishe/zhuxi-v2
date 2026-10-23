import { checkGroupConstraints, checkHardConstraints } from "./constraints"
import { findGroupBestSlot, tryPair } from "./match-utils"
import { getPairStatus } from "./pair-history"
import type { MatchingEngineInput } from "./run-input"
import { describeMultiPool, runFullMatching, type MatchResultRow, type RunResult } from "./run-matching"
import { scorePairFactors } from "./scorer"

export interface ManualAdjustmentInspection {
  passed: boolean
  reasons: string[]
  bestSlot: string | null
  rows: MatchResultRow[]
}

export class AdjustmentConstraintError extends Error {
  readonly code = "MATCHING_ADJUSTMENT_CONSTRAINT"
  constructor(readonly reasons: string[]) {
    super(reasons.join("；"))
    this.name = "AdjustmentConstraintError"
  }
}

/**
 * Inspect the complete final selection, using the same frozen input that will
 * be submitted. Qualification and session occupancy are checked by the capture
 * and commit transactions, not inferred here from a stale UI member list.
 */
export function inspectManualAdjustment(engine: MatchingEngineInput, memberIds: readonly string[]): ManualAdjustmentInspection {
  const ids = new Map(engine.idMap)
  const byMember = new Map<string, typeof engine.candidates[number]>()
  const ambiguous = new Set<string>()
  for (const candidate of engine.candidates) {
    const memberId = ids.get(candidate.submissionId) ?? candidate.submissionId
    if (byMember.has(memberId)) ambiguous.add(memberId)
    byMember.set(memberId, candidate)
  }
  const reasons: string[] = []
  if (memberIds.length < 2) reasons.push("请至少选择2名成员")
  if (new Set(memberIds).size !== memberIds.length) reasons.push("不能重复选择同一名成员")
  if (memberIds.some((id) => !byMember.has(id) || ambiguous.has(id))) reasons.push("所选成员不在本次有效候选名单中，请刷新后重试")
  if (reasons.length) return { passed: false, reasons, bestSlot: null, rows: [] }

  const members = memberIds.map((id) => byMember.get(id)!)
  const relations = new Map(engine.pairRelations)
  const bestSlot = findGroupBestSlot(members)
  if (!bestSlot) reasons.push("所有成员没有共同可用时段")
  if (members.length === 2) {
    // A flexible partner does not turn a multiplayer-only applicant into a duo.
    if (members.some((member) => member.gameTypePref === "多人")) reasons.push("选择了多人的成员不能加入双人结果")
    reasons.push(...checkHardConstraints(members[0], members[1], engine.config, relations).reasons)
    if (reasons.length) return { passed: false, reasons: [...new Set(reasons)], bestSlot, rows: [] }
    const pair = tryPair(members, 0, 1, engine.config, relations, false)
    if (!pair) return { passed: false, reasons: ["所选成员未通过最终配对检查"], bestSlot, rows: [] }
    return { passed: true, reasons: [], bestSlot, rows: [{
      member_a_id: memberIds[0], member_b_id: memberIds[1], group_members: null,
      total_score: pair.score.totalScore, score_breakdown: pair.score.breakdown, rank: 1,
      best_slot: pair.bestSlot || null,
      game_type: pair.bonus > 0 ? "双人(重逢)" : pair.isRepeat ? "双人(重复)" : "双人",
    }] }
  }

  reasons.push(...checkGroupConstraints(members[0], members.slice(1), engine.config, relations).reasons)
  if (reasons.length) return { passed: false, reasons: [...new Set(reasons)], bestSlot, rows: [] }
  let total = 0, pairs = 0, hasRepeat = false
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
    total += scorePairFactors(members[i], members[j], engine.config).totalScore
    pairs++
    if (getPairStatus(relations, members[i].submissionId, members[j].submissionId).status === "avoid") hasRepeat = true
  }
  return { passed: true, reasons: [], bestSlot, rows: [{
    member_a_id: memberIds[0], member_b_id: null, group_members: [...memberIds],
    total_score: Math.round(total / pairs * 10) / 10,
    score_breakdown: engine.config.scoringPolicy ? describeMultiPool(members, engine.config) : null,
    rank: 1, best_slot: bestSlot, game_type: hasRepeat ? "多人(重复)" : "多人",
  }] }
}

/** Saving must call the same inspection as preview; there is no force bypass. */
export function buildManualAdjustment(engine: MatchingEngineInput, memberIds: readonly string[]): MatchResultRow[] {
  const inspection = inspectManualAdjustment(engine, memberIds)
  if (!inspection.passed) throw new AdjustmentConstraintError(inspection.reasons)
  return inspection.rows
}

/**
 * An existing pool stays untouched. Explicit multiplayer-only applicants remain
 * unmatched when no second pool may be created; they are never coerced to duos.
 */
export function runPoolAdjustment(engine: MatchingEngineInput, hasExistingMultiPool: boolean): RunResult {
  return runFullMatching(engine.candidates, engine.config, new Map(engine.idMap), new Map(engine.pairRelations), {
    allowMultiPool: !hasExistingMultiPool,
  })
}
