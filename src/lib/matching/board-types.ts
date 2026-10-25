import type { MatchResultRow } from "./run-matching"

export interface BoardDuo {
  key: string
  resultId?: string
  memberIds: [string, string]
  bestSlot: string | null
}
export interface BoardMulti {
  key: string
  resultId?: string
  memberIds: string[]
  bestSlot: string | null
}
export interface BoardDraft {
  duos: BoardDuo[]
  multi: BoardMulti | null
  waitingDuoIds: string[]
  /** Visual references only; both people must also be in waitingDuoIds. */
  brokenPairs: { key: string; memberIds: [string, string] }[]
  unmatchedIds: string[]
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
export interface BoardSnapshot {
  draft: BoardDraft
  revisionToken: string
  rows: BoardDisplayRow[]
  lockedResultIds: string[]
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
