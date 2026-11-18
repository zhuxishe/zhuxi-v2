export type PeerScoreDirectorySort = "score" | "reviewer_count" | "latest_review_at"
export type PeerScoreDirectoryDirection = "asc" | "desc"
export type PeerScoreSampleStatus = "ready" | "accumulating" | "unrated"
export type PeerScoreDirectoryStatus = "all" | PeerScoreSampleStatus

export interface PeerScoreDirectoryControls {
  search: string
  status: PeerScoreDirectoryStatus
  sort: PeerScoreDirectorySort
  direction: PeerScoreDirectoryDirection
  page: number
}

export interface PeerScoreDirectoryMember {
  memberId: string
  memberNumber: string | null
  fullName: string
  nickname: string | null
  score: number | null
  reviewerCount: number
  activityCount: number
  reviewCount: number
  latestReviewAt: string | null
  sampleStatus: PeerScoreSampleStatus
}

export interface MemberPeerScoreDirectory {
  members: PeerScoreDirectoryMember[]
  total: number
  page: number
  pageSize: number
  sort: PeerScoreDirectorySort
  direction: PeerScoreDirectoryDirection
  sampleStatus: PeerScoreDirectoryStatus
  canViewMemberNumber: boolean
}

export type MemberPeerScoreDirectoryResult =
  | { status: "ready"; data: MemberPeerScoreDirectory }
  | { status: "unavailable" }
