import { createHash } from "node:crypto"
import { getBoardTimeOptions } from "./board-time-options"
import type { BoardLayout, BoardSourceRow, BoardSubmissionPreference } from "./board-types"
import type { PublicationResultInput } from "./publication-preflight"
import type { MatchingReviewMember, SavedMatchingReview } from "./session-review-types"
import { normalizeUnmatchedMemberMessages, normalizeUnmatchedMessage } from "./unmatched-message"

type Row = Record<string, unknown>
export interface SavedReviewCapture {
  base_revision: string
  capture: unknown
  results: BoardSourceRow[]
  layout: BoardLayout | null
  cohort_member_ids: string[]
  session_status?: string
  unmatched_message_recipient_ids?: string[]
}
export interface MatchingReviewWorkbookData {
  results: BoardSourceRow[]
  submissions: Row[]
  members: Array<{ id: string; member_number: string | null; anonymized_at: string | null; member_identity: { full_name: string; nickname: null; gender: string | null } }>
  diagnostics: Array<{ member_id: string; reason: string; details: unknown }>
  cohortMemberIds: string[]
  layout: BoardLayout | null
  capturedAt: string | null
}

const object = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value)
const text = (value: unknown) => typeof value === "string" ? value.trim() : ""
const normalizeSlot = (value: string | null) => value?.replace(" ", "_") ?? null
const sameMembers = (left: readonly string[], right: readonly string[]) => left.length === right.length && new Set(left).size === right.length && left.every((id) => right.includes(id))
const relation = (value: unknown): Row | null => {
  const result = Array.isArray(value) && value.length === 1 ? value[0] : value
  return object(result) ? result : null
}
const idsOf = (row: PublicationResultInput): string[] => row.group_members?.length
  ? [...row.group_members] : [row.member_a_id, row.member_b_id].filter((id): id is string => typeof id === "string" && !!id)

function sourceRows(capture: unknown): Row[] {
  if (!object(capture) || !object(capture.source) || !Array.isArray(capture.source.submissions)
    || capture.source.submissions.some((row) => !object(row) || typeof row.member_id !== "string")) {
    throw new Error("暂时无法完整读取发布前核对资料，请重新读取后重试。")
  }
  return capture.source.submissions as Row[]
}

/** One authoritative captured answer per member; cancelled or ambiguous answers have no usable availability. */
function preferences(capture: unknown) {
  const prefs: Record<string, BoardSubmissionPreference> = {}, seen = new Set<string>()
  for (const row of sourceRows(capture)) {
    const id = row.member_id as string
    if (seen.has(id)) { prefs[id] = {}; continue }
    seen.add(id)
    prefs[id] = row.cancelled_at == null && !relation(row.member)?.anonymized_at
      ? { availability: row.availability as BoardSubmissionPreference["availability"] } : {}
  }
  return prefs
}

/**
 * Binds the reviewed membership, saved recommendation and current intersection.
 * It deliberately ignores candidate order, display names, score/private fields
 * and capture timestamps. The final publication proof still binds all existing
 * eligibility, hard-constraint, layout and saved-result revision checks.
 */
export function matchingReviewPublicationSignature(sessionId: string, rows: readonly PublicationResultInput[], capture: unknown, unmatchedMessage?: string | null, recipientIds?: readonly string[], memberMessages?: Record<string, string | null>): string {
  const prefs = preferences(capture)
  const payload = rows.filter((row) => row.status !== "cancelled").map((row) => {
    const memberIds = idsOf(row).sort()
    const times = getBoardTimeOptions(memberIds, prefs, null)
    return { resultId: row.id, memberIds, recommendedSlot: normalizeSlot(row.best_slot),
      timeStatus: times.complete ? "ready" : "unavailable", commonSlots: times.commonSlots }
  }).sort((a, b) => a.resultId.localeCompare(b.resultId))
  const message = normalizeUnmatchedMessage(unmatchedMessage)
  // Publication preflight intentionally captures only matched members' answers.
  // The board projection and database validate override keys against the full cohort.
  const personal = normalizeUnmatchedMemberMessages(memberMessages)
  const hasPersonal = Object.keys(personal).length > 0
  if (recipientIds !== undefined && (!Array.isArray(recipientIds) || recipientIds.some((id) => typeof id !== "string") || new Set(recipientIds).size !== recipientIds.length)) throw new Error("工作人员留言接收名单无效，请重新核对。")
  return createHash("sha256").update(JSON.stringify({ sessionId, groups: payload, ...(message ? { unmatchedMessage: message,
    ...(recipientIds !== undefined ? { messageRecipientIds: [...recipientIds].sort() } : {}) } : {}),
    ...(hasPersonal ? { unmatchedMemberMessages: Object.fromEntries(Object.entries(personal).sort(([a], [b]) => a.localeCompare(b))),
      ...(!message && recipientIds !== undefined ? { messageRecipientIds: [...recipientIds].sort() } : {}) } : {}) })).digest("hex")
}

/** Safe projection of a single board capture. No original run snapshot is consulted. */
export function buildSavedMatchingReview(sessionId: string, data: SavedReviewCapture, canViewTimes: boolean): SavedMatchingReview {
  const submissions = sourceRows(data.capture), prefs = preferences(data.capture)
  const unmatchedMessage = normalizeUnmatchedMessage(data.layout?.unmatchedMessage)
  const cohort = [...new Set(data.cohort_member_ids)]
  const personal = normalizeUnmatchedMemberMessages(data.layout?.unmatchedMemberMessages, cohort)
  const allowed = new Set(cohort), members = new Map<string, MatchingReviewMember>()
  for (const row of submissions) {
    const id = row.member_id as string
    if (!allowed.has(id)) continue
    const member = relation(row.member), identity = relation(member?.member_identity)
    const privateErased = !!member?.anonymized_at
    members.set(id, { id, name: privateErased ? "已注销成员" : text(identity?.full_name) || text(identity?.nickname) || "姓名未提供",
      memberNumber: privateErased ? null : text(member?.member_number) || null })
  }
  const memberOf = (id: string): MatchingReviewMember => members.get(id) ?? { id, name: "姓名未提供", memberNumber: null }
  const active = data.results.filter((row) => row.status !== "cancelled")
    .sort((a, b) => (Number(a.rank) || 0) - (Number(b.rank) || 0) || a.id.localeCompare(b.id))
  const ordered = [...active.filter((row) => !row.group_members?.length), ...active.filter((row) => !!row.group_members?.length)]
  let duoGroups = 0, multiGroups = 0
  const assigned = new Set<string>(), issues = new Set<string>()
  const groups = ordered.map((row) => {
    const memberIds = idsOf(row), multi = !!row.group_members?.length
    if (memberIds.length !== new Set(memberIds).size || memberIds.some((id) => assigned.has(id) || !allowed.has(id))
      || (multi ? memberIds.length < 3 : memberIds.length !== 2)) issues.add("已保存结果包含不完整或重复的分组成员，请核对后再发布。")
    memberIds.forEach((id) => assigned.add(id))
    const times = getBoardTimeOptions(memberIds, prefs, null)
    const small = multi && data.layout?.smallGroupMemberIds?.some((ids) => sameMembers(ids, memberIds))
    const manual = small && data.layout?.manualSmallGroupMemberIds?.some((ids) => sameMembers(ids, memberIds))
    if (small && !manual && (memberIds.length < 4 || memberIds.length > 6)) issues.add("有4–6人小组的人数不符合要求，请调整并保存。")
    if (!times.complete) issues.add("部分分组缺少有效的当前报名时间，请重新核对资料。")
    else if (!row.best_slot || !times.commonSlots.includes(normalizeSlot(row.best_slot)!)) issues.add("部分分组的推荐时间已不在全员共同时间内，请调整并保存。")
    const label = multi ? `多人 ${String(++multiGroups).padStart(2, "0")}` : `双人 ${String(++duoGroups).padStart(2, "0")}`
    return { resultId: row.id, label, kind: multi ? "multi" as const : "duo" as const, ...(small ? { groupKind: "small" as const } : {}), ...(manual ? { manuallyAdjusted: true as const } : {}),
      members: memberIds.map(memberOf), recommendedSlot: normalizeSlot(row.best_slot),
      commonSlots: canViewTimes ? times.commonSlots : [], timeStatus: !canViewTimes ? "hidden" as const : times.complete ? "ready" as const : "unavailable" as const }
  })
  const waitingDuoIds = [...new Set(data.layout?.waitingDuoIds ?? [])].filter((id) => allowed.has(id) && !assigned.has(id))
  const waitingDuoSet = new Set(waitingDuoIds)
  const waitingMultiIds = data.layout?.multiMode === "grouped"
    ? [...new Set(data.layout.waitingMultiIds ?? [])].filter((id) => allowed.has(id) && !assigned.has(id) && !waitingDuoSet.has(id)) : []
  const waitingMultiSet = new Set(waitingMultiIds)
  const unmatchedIds = cohort.filter((id) => !assigned.has(id) && !waitingDuoSet.has(id) && !waitingMultiSet.has(id))
  const recipientIds = data.unmatched_message_recipient_ids
  const possibleRecipients = new Set([...waitingDuoIds, ...unmatchedIds])
  if (recipientIds !== undefined && (!Array.isArray(recipientIds) || new Set(recipientIds).size !== recipientIds.length || recipientIds.some((id) => typeof id !== "string" || !possibleRecipients.has(id)))) {
    throw new Error("工作人员留言接收名单与已保存方案不一致，请重新核对。")
  }
  const eligibleRecipients = new Set(recipientIds ?? possibleRecipients)
  const projectedPersonal = Object.fromEntries(Object.entries(personal).filter(([id]) => eligibleRecipients.has(id)))
  if (waitingMultiIds.length) issues.add("仍有多人候选尚未分组，请完成安排或移至未匹配池后再发布。")
  const rawVersions = [...new Set(active.map((row) => (row as unknown as Row).publication_version))]
  // New result rows in a withdrawn draft start at version 0 even when the
  // session previously published v2. Never treat that row version as the
  // expected session publication version; only current confirmed rows agree.
  const publicationVersion = data.session_status === "confirmed" && rawVersions.length === 1 && Number.isSafeInteger(rawVersions[0]) && Number(rawVersions[0]) > 0
    ? rawVersions[0] as number : null
  const capturedAt = object(data.capture) && typeof data.capture.captured_at === "string" ? data.capture.captured_at : null
  return { sessionId, revisionToken: data.base_revision, publicationSignature: matchingReviewPublicationSignature(sessionId, active, data.capture, unmatchedMessage, recipientIds, personal), unmatchedMessage,
    ...(Object.keys(projectedPersonal).length ? { unmatchedMemberMessages: projectedPersonal } : {}),
    ...(recipientIds !== undefined ? { messageRecipients: recipientIds.map(memberOf) } : {}),
    capturedAt, sessionStatus: data.session_status ?? "unknown", publicationVersion, canViewTimes, groups,
    waitingDuo: waitingDuoIds.map(memberOf), waitingMulti: waitingMultiIds.map(memberOf), unmatched: unmatchedIds.map(memberOf),
    summary: { total: cohort.length, duoGroups, multiGroups, matched: assigned.size, waitingDuo: waitingDuoIds.length, waitingMulti: waitingMultiIds.length, unmatched: unmatchedIds.length }, issues: [...issues] }
}

/** Server-only workbook inputs. Names and answers come from the same current capture as the review. */
export function savedMatchingReviewWorkbookData(data: SavedReviewCapture, review: SavedMatchingReview): MatchingReviewWorkbookData {
  const allowed = new Set(data.cohort_member_ids)
  const currentRows = sourceRows(data.capture).filter((row) => allowed.has(row.member_id as string))
  const demographicById = new Map<string, { gender: string | null; anonymizedAt: string | null }>()
  for (const row of currentRows) {
    const id = row.member_id as string, current = relation(row.member), identity = relation(current?.member_identity)
    const previous = demographicById.get(id)
    const erased = previous?.anonymizedAt || (current?.anonymized_at ? text(current.anonymized_at) || "redacted" : null)
    const gender = identity?.gender
    demographicById.set(id, { anonymizedAt: erased,
      gender: erased || previous || (gender !== "male" && gender !== "female" && gender !== "other") ? null : gender })
  }
  const submissions = currentRows.map((row) => {
    if (demographicById.get(row.member_id as string)?.anonymizedAt) return { member_id: row.member_id }
    const metadata = relation(row.import_metadata)
    return { member_id: row.member_id, game_type_pref: row.game_type_pref, gender_pref: row.gender_pref,
      availability: row.cancelled_at == null ? row.availability : undefined, message: row.message,
      ...(metadata ? { import_metadata: { source: metadata.source, normalized_name: metadata.normalized_name, raw_notes: metadata.raw_notes } } : {}) }
  })
  const people = [...review.groups.flatMap((group) => group.members), ...review.waitingDuo, ...review.waitingMulti, ...review.unmatched]
  return { results: data.results.filter((row) => row.status !== "cancelled").map((row) => ({ ...row })), submissions,
    members: [...new Map(people.map((member) => [member.id, { id: member.id, member_number: member.memberNumber,
      anonymized_at: demographicById.get(member.id)?.anonymizedAt ?? null,
      member_identity: { full_name: member.name, nickname: null, gender: demographicById.get(member.id)?.gender ?? null } }])).values()],
    diagnostics: [],
    cohortMemberIds: [...data.cohort_member_ids], layout: data.layout ? structuredClone(data.layout) : null, capturedAt: review.capturedAt }
}
