export type ActivityReviewStatus = "unavailable" | "scheduled" | "open" | "closed" | "paused"
export type ActivityReportCategory = "harassment" | "privacy" | "disruption" | "other"
export type ActivityReportStatus = "pending" | "reviewing" | "resolved" | "dismissed"

export interface ActivityReviewSettings {
  enabled: boolean
  autoIncludeRegistered?: boolean
  autoIncludeSupported?: boolean
  opensAt: string | null
  closesAt: string | null
  openedAt: string | null
  rosterConfirmed: boolean
  version: number
}
export interface ActivityReview {
  id: string
  reviewerId?: string
  revieweeId: string
  score: number
  comment: string
  version: number
  valid: boolean
  updatedAt: string
  createdAt?: string
}
export interface ActivityReportSupplement { detail: string; createdAt: string }
export interface ActivityReport {
  id: string
  reporterId?: string
  revieweeId: string
  category: ActivityReportCategory
  detail: string
  status: ActivityReportStatus
  version: number
  createdAt: string
  updatedAt: string
  supplements: ActivityReportSupplement[]
  internalNote?: string
}
export interface ActivityReviewParticipant {
  memberId: string
  fullName: string
  nickname: string | null
  review: ActivityReview | null
  report: ActivityReport | null
}
export interface ActivityReviewRound {
  roundId: string
  title: string
  status: ActivityReviewStatus
  opensAt: string | null
  closesAt: string | null
  reviewedCount: number
  hasSubmittedFeedback?: boolean
  participantCount: number
  canReview: boolean
  canReport: boolean
}
export interface ActivityReviewHistoryTarget {
  memberId: string
  fullName: string
  nickname: string | null
  canReview: boolean
  canReport: boolean
}
export interface ActivityReviewContext extends ActivityReviewRound {
  eligible: boolean
  settings: ActivityReviewSettings
  participants: ActivityReviewParticipant[]
  ownReviews?: ActivityReview[]
  ownReports?: ActivityReport[]
  historyTargets?: ActivityReviewHistoryTarget[]
  total: number
  page: number
  pageSize: number
  search: string
  setupRequired?: boolean
}
export interface SubmitActivityReviewInput {
  operation: "save" | "append_report" | "edit_report"
  roundId: string
  targetMemberId: string
  review?: { score: number; comment: string; expectedVersion: number }
  report?: { category: ActivityReportCategory; detail: string; expectedVersion: number }
  // Use a stable ID for retrying one attempted submission.
  requestId?: string
}
export interface ActivityReviewActionResult {
  success?: boolean
  error?: string
  review?: ActivityReview | null
  report?: ActivityReport | null
}
export interface AdminActivityReviewEvent extends ActivityReviewRound {
  settings: ActivityReviewSettings
  reviewCount: number
  pendingReportCount: number
}
export interface AdminActivityReviewMember {
  memberId: string
  fullName: string
  nickname: string | null
  source: string
  included: boolean
  eligible: boolean
  registered: boolean
  canRestore?: boolean
}
export interface ActivityReviewAudit {
  id: string
  action: string
  actorId: string | null
  actorKind?: "admin" | "player" | "system"
  reason: string
  createdAt: string
  reviewId?: string | null
  reportId?: string | null
  details?: Record<string, unknown>
}
export interface AdminActivityReviewContext {
  roundId: string
  title: string
  settings: ActivityReviewSettings
  participants: AdminActivityReviewMember[]
  candidates: AdminActivityReviewMember[]
  reviews: ActivityReview[]
  reports: ActivityReport[]
  audit: ActivityReviewAudit[]
  canManageSettings: boolean
  canModerateReports: boolean
}
export interface AdminActivityReviewsData {
  events: AdminActivityReviewEvent[]
  context: AdminActivityReviewContext | null
  memberOptions: { memberId: string; fullName: string; nickname: string | null }[]
  setupRequired: boolean
  memberFilter: string | null
}
export interface SaveActivityReviewSettingsInput {
  roundId: string; enabled: boolean; autoIncludeRegistered?: boolean; opensAt: string; closesAt: string
  expectedVersion: number; reason: string
}
export interface ConfirmActivityReviewRosterInput {
  roundId: string; memberIds: string[]; expectedVersion: number; reason: string
}
export interface ModerateActivityReviewInput {
  roundId: string; reviewId: string; valid: boolean; expectedVersion: number; reason: string
}
export interface ModerateActivityReportInput {
  roundId: string; reportId: string; status: ActivityReportStatus; internalNote: string
  expectedVersion: number; reason: string
}
