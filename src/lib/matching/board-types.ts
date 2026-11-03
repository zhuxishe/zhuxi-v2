import type { MatchResultRow } from "./run-matching"

export interface BoardDuo {
  key: string
  resultId?: string
  memberIds: [string, string]
  bestSlot: string | null
  /** Explicit administrator-selected common slot; never accepts an incompatible time. */
  manuallyScheduled?: true
}
export interface BoardMulti {
  key: string
  resultId?: string
  memberIds: string[]
  bestSlot: string | null
  /** Explicitly confirmed in the 4–6-person section; absent for ordinary time groups. */
  groupKind?: "small"
  /** An administrator explicitly changed or created this small group. */
  manuallyAdjusted?: true
}
export interface BoardDraft {
  duos: BoardDuo[]
  multi: BoardMulti | null
  /** Absent on legacy boards; grouped pools contain only people awaiting a formal group. */
  multiMode?: "grouped"
  multiGroups?: BoardMulti[]
  waitingDuoIds: string[]
  /** Visual references only; both people must also be in waitingDuoIds. */
  brokenPairs: { key: string; memberIds: [string, string] }[]
  unmatchedIds: string[]
  /** Public-facing message for the final unmatched recipients of this batch. */
  unmatchedMessage?: string
  /** Missing member inherits common copy; null explicitly hides that player's message. */
  unmatchedMemberMessages?: Record<string, string | null>
}
export interface BoardLayout {
  waitingDuoIds: string[]
  brokenPairs: BoardDraft["brokenPairs"]
  multiMode?: "grouped"
  waitingMultiIds?: string[]
  multiPoolSlot?: string | null
  /** Complete member sets of saved small groups, resolved against active results on read. */
  smallGroupMemberIds?: string[][]
  manualSmallGroupMemberIds?: string[][]
  unmatchedMessage?: string
  unmatchedMemberMessages?: Record<string, string | null>
}
export interface BoardSmallGroupRecommendation {
  key: string
  memberIds: string[]
  bestSlot: string
  commonSlots: string[]
  manuallyAdjusted?: true
}
export interface BoardSmallGroupRecommendationsResult {
  success?: true
  recommendations?: BoardSmallGroupRecommendation[]
  revisionToken?: string
  error?: string
}
export type BoardDisplayRow = MatchResultRow & { key: string; resultId?: string; status?: string }
export type BoardSourceRow = MatchResultRow & { id: string; status: string }
export interface BoardSubmissionPreference {
  game_type_pref?: string
  gender_pref?: string
  availability?: Record<string, string[]>
  interest_tags?: string[]
  social_style?: string | null
}
export interface BoardOperationSummary { id: string; created_at: string; member_count: number; result_count: number }
export interface BoardMemberLockOperationSummary { id: string; created_at: string; locked: boolean }
export interface BoardMemberLockRequest { sessionId: string; memberId: string; locked: boolean; expectedRevision: string; operationId: string }
export interface BoardSnapshot {
  /** Safe read-only summary of the same saved capture, never the local editing draft. */
  savedReview?: import("./session-review-types").SavedMatchingReview | null
  draft: BoardDraft
  revisionToken: string
  rows: BoardDisplayRow[]
  lockedResultIds: string[]
  lockedMemberIds: string[]
  memberLockOperations?: BoardMemberLockOperationSummary[]
  cohortMemberIds: string[]
  canViewRaw: boolean
  operations?: BoardOperationSummary[]
  /** Current captured round answers, projected only for super administrators. */
  currentSubmissionPrefs?: Record<string, BoardSubmissionPreference>
}
export interface BoardRequest { sessionId: string; draft: BoardDraft; expectedRevision: string }
export interface BoardActionResult {
  success?: true
  error?: string
  draft?: BoardDraft
  rows?: BoardDisplayRow[]
  revisionToken?: string
  passed?: boolean
  reasons?: string[]
  operationId?: string
  /** Unknown save outcome: retry the identical request with the same operationId. */
  unknown?: boolean
}
