import { checkGroupConstraints, checkHardConstraints } from "./constraints"
import {
  LEGACY_MATCHING_ENGINE_ALGORITHM_VERSION,
  LEGACY_MATCHING_RUN_ADAPTER_VERSION,
  MATCHING_ENGINE_ALGORITHM_VERSION,
  MATCHING_RUN_ADAPTER_VERSION,
  prepareMatchingRunInput,
  type MatchingEngineInput,
} from "./run-input"
import type { MatchCandidate } from "./types"

/** Only these saved fields are needed. Scores and explanations are never read. */
export interface PublicationResultInput {
  id: string
  status: string
  member_a_id: string
  member_b_id: string | null
  group_members: string[] | null
  best_slot: string | null
}

export type PublicationPreflightIssueCode = "invalid_result" | "member_unavailable" | "hard_constraint" | "original_time_unavailable"

/** Safe for ordinary administrators: no profile, blacklist or feedback details. */
export interface PublicationPreflightIssue {
  resultId: string
  code: PublicationPreflightIssueCode
  message: string
}

export interface PublicationPreflightInspection {
  passed: boolean
  issues: PublicationPreflightIssue[]
}

const messages: Record<PublicationPreflightIssueCode, string> = {
  invalid_result: "方案包含无效或重复的匹配成员，请重新核对。",
  member_unavailable: "存在已撤销报名、资料不完整或当前不可参与的成员，请重新核对。",
  hard_constraint: "当前成员信息或关系已不满足匹配硬约束，请重新核对。",
  original_time_unavailable: "原推荐时间已不是全部成员共同可用的时间，请调整方案后再发布。",
}

/**
 * Build current qualification and hard-constraint inputs with the existing
 * adapter and history semantics. V3 only enriches scoring fields, so its policy
 * is deliberately unused here. A changed personality weight or peer-review
 * policy must neither recalculate an existing score nor prevent this check.
 * The server supplies an authoritative capture scoped to the saved matches.
 */
export function preparePublicationPreflightInput(capture: unknown): MatchingEngineInput {
  if (!capture || typeof capture !== "object" || Array.isArray(capture)) throw new Error("PUBLICATION_INPUT_INVALID")
  const value = structuredClone(capture) as Record<string, unknown>
  if (!value.source || typeof value.source !== "object" || Array.isArray(value.source)) throw new Error("PUBLICATION_INPUT_INVALID")
  const source = value.source as Record<string, unknown>
  const legacy = (source.algorithm_version === undefined && source.adapter_version === undefined)
    || (source.algorithm_version === LEGACY_MATCHING_ENGINE_ALGORITHM_VERSION && source.adapter_version === LEGACY_MATCHING_RUN_ADAPTER_VERSION)
  const current = source.algorithm_version === MATCHING_ENGINE_ALGORITHM_VERSION && source.adapter_version === MATCHING_RUN_ADAPTER_VERSION
  if (!legacy && !current) throw new Error("VERSION_UNSUPPORTED")
  delete source.algorithm_version
  delete source.adapter_version
  delete source.scoring_policy
  return prepareMatchingRunInput(value).engineInput
}

/** Accept the original two stored slot formats without selecting another time. */
export function hasOriginalPublicationSlot(members: readonly MatchCandidate[], bestSlot: string | null): boolean {
  if (!bestSlot || members.length === 0) return false
  for (const [date, slots] of Object.entries(members[0].availability)) {
    for (const slot of slots) {
      if ((bestSlot === `${date}_${slot}` || bestSlot === `${date} ${slot}`)
        && members.every((member) => member.availability[date]?.includes(slot))) return true
    }
  }
  return false
}

/**
 * Inspect the exact saved groups against current inputs. This does not call the
 * matching algorithm or any scorer, select a new slot, mutate a row, or change
 * existing history/cooldown semantics. Database publication still performs its
 * own account, occupancy and transaction-freshness checks before writing.
 */
export function inspectPublicationPreflight(
  engine: MatchingEngineInput,
  rows: readonly PublicationResultInput[],
): PublicationPreflightInspection {
  const idMap = new Map(engine.idMap)
  const byMember = new Map<string, MatchCandidate>()
  const ambiguous = new Set<string>()
  for (const candidate of engine.candidates) {
    const memberId = idMap.get(candidate.submissionId) ?? candidate.submissionId
    if (byMember.has(memberId)) ambiguous.add(memberId)
    byMember.set(memberId, candidate)
  }
  const seen = new Set<string>()
  const relations = new Map(engine.pairRelations)
  const issues: PublicationPreflightIssue[] = []
  const add = (row: PublicationResultInput, code: PublicationPreflightIssueCode) => {
    issues.push({ resultId: row.id, code, message: messages[code] })
  }
  let poolCount = 0
  for (const row of rows) {
    // Historical cancellations and unmatched people are not being published as
    // an active match and must not acquire new matching-qualification gates.
    if (row.status === "cancelled") continue
    const isPool = !!row.group_members?.length
    const memberIds = isPool ? row.group_members! : [row.member_a_id, row.member_b_id].filter((id): id is string => !!id)
    const invalidShape = !["draft", "locked"].includes(row.status)
      || memberIds.length < (isPool ? 3 : 2)
      || (!isPool && !row.member_b_id)
      || (isPool && (!memberIds.includes(row.member_a_id) || row.member_b_id !== null))
      || new Set(memberIds).size !== memberIds.length
      || memberIds.some((id) => seen.has(id))
      || (isPool && ++poolCount > 1)
    memberIds.forEach((id) => seen.add(id))
    if (invalidShape) { add(row, "invalid_result"); continue }
    if (memberIds.some((id) => !byMember.has(id) || ambiguous.has(id))) {
      add(row, "member_unavailable")
      continue
    }
    const members = memberIds.map((id) => byMember.get(id)!)
    const passed = isPool
      ? checkGroupConstraints(members[0], members.slice(1), engine.config, relations).passed
      : members.every((member) => member.gameTypePref !== "多人")
        && checkHardConstraints(members[0], members[1], engine.config, relations).passed
    if (!passed) add(row, "hard_constraint")
    if (!hasOriginalPublicationSlot(members, row.best_slot)) add(row, "original_time_unavailable")
  }
  return { passed: issues.length === 0, issues }
}
