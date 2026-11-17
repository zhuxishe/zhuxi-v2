export interface MemberPeerScoreReview {
  review_id: string
  round_id: string
  round_name: string
  score: number
  updated_at: string
}

export interface MemberPeerScoreSource {
  reviewer_id: string
  reviewer_name: string
  score: number
  review_count: number
  activity_count: number
  reviews: MemberPeerScoreReview[]
}

/** An administrator-only calculation. It does not replace published profile metrics. */
export interface MemberPeerScore {
  member_id: string
  score: number | null
  reviewer_count: number
  activity_count: number
  review_count: number
  eligible_for_publication: boolean
  sources: MemberPeerScoreSource[]
}

export type MemberPeerScoreResult =
  | { status: "ready"; data: MemberPeerScore }
  | { status: "unavailable" }
