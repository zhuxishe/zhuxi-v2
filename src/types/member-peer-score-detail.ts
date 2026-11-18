export type PeerScoreValidity = "valid" | "invalid" | "all"
export type PeerScoreSampleStatus = "unrated" | "accumulating" | "ready"

export interface MemberPeerScoreDetailFilters {
  validity: PeerScoreValidity
  roundId: string | null
  page: number
  pageSize: number
}

export interface PeerScoreDetailSummary {
  score: number | null
  reviewerCount: number
  activityCount: number
  reviewCount: number
  eligibleForPublication: boolean
  latestReviewAt: string | null
  sampleStatus: PeerScoreSampleStatus
}

export interface PeerScoreDetailReviewer {
  reviewerId: string
  name: string
  nickname: string | null
  score: number
  reviewCount: number
  activityCount: number
  latestReviewAt: string | null
}

export interface PeerScoreDetailActivity {
  roundId: string
  name: string
  activityStart: string | null
  activityEnd: string | null
  reviewCount: number
  invalidReviewCount: number
  reviewerCount: number
  averageScore: number | null
  registrationStatus: "active" | "cancelled" | "none"
  inReviewRoster: boolean
  rosterIncluded: boolean | null
  rosterSource: "registered" | "manual" | null
}

export interface PeerScoreDetailReview {
  reviewId: string
  roundId: string
  roundName: string
  activityStart: string | null
  activityEnd: string | null
  reviewerId: string
  reviewerName: string
  reviewerNickname: string | null
  score: number
  comment: string
  valid: boolean
  createdAt: string
  updatedAt: string
  invalidationReason: string | null
  invalidatedAt: string | null
}

export interface MemberPeerScoreDetail {
  member: { id: string; name: string; nickname: string | null; memberNumber: string | null }
  summary: PeerScoreDetailSummary
  operationalScore: {
    score: number | null
    status: "pending" | "published"
    source: "initial" | "manual"
    internalNote: string | null
    publishedAt: string | null
    updatedAt: string | null
    publishedByName: string | null
    updatedByName: string | null
  } | null
  /** Complete valid-review aggregates, independent of the record filter/page. */
  reviewers: PeerScoreDetailReviewer[]
  /** Complete activity aggregates, independent of the record filter/page. */
  activities: PeerScoreDetailActivity[]
  reviews: PeerScoreDetailReview[]
  total: number
  filters: MemberPeerScoreDetailFilters
  canViewMemberNumber: boolean
}

export type MemberPeerScoreDetailResult =
  | { status: "ready"; data: MemberPeerScoreDetail }
  | { status: "unavailable" | "not_found" }
