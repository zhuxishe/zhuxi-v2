export interface MatchingReviewMember {
  id: string
  name: string
  memberNumber: string | null
}

export interface MatchingReviewGroup {
  resultId: string
  label: string
  kind: "duo" | "multi"
  groupKind?: "small"
  members: MatchingReviewMember[]
  recommendedSlot: string | null
  /** Complete intersection, including the recommendation when it remains valid. */
  commonSlots: string[]
  timeStatus: "ready" | "unavailable" | "hidden"
}

export interface SavedMatchingReview {
  sessionId: string
  revisionToken: string
  publicationSignature: string
  capturedAt: string | null
  sessionStatus: string
  /** The capture predates this metadata on some historical sessions. */
  publicationVersion: number | null
  canViewTimes: boolean
  groups: MatchingReviewGroup[]
  waitingDuo: MatchingReviewMember[]
  waitingMulti: MatchingReviewMember[]
  unmatched: MatchingReviewMember[]
  summary: { total: number; duoGroups: number; multiGroups: number; matched: number; waitingDuo: number; waitingMulti: number; unmatched: number }
  /** Safe, user-facing validation messages; never raw relationship/profile details. */
  issues: string[]
}
