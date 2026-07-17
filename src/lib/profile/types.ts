export type MemberLevel = 1 | 2 | 3

export type CompatibilityStatus = "pending" | "published"

export type ProfileScoreSource = "initial" | "manual"

export type ProfileAuditAction =
  | "profile_update"
  | "metrics_update"
  | "activity_recalculate"

export interface PlayerProfileSummary {
  memberId: string
  memberNumber: string | null
  status: string
  email: string | null
  lineUserId: string | null
  fullName: string
  gender: "male" | "female" | "other"
  nickname: string | null
  schoolName: string | null
  department: string | null
  personalAvatarPath: string | null
  personalAvatarUrl: string | null
  level: MemberLevel
  compatibilityScore: number | null
  compatibilityStatus: CompatibilityStatus
  activityCount: number
  lastActivityAt: string | null
  communityProfileId: string | null
  communityAvatarKind: "default" | "preset" | "personal" | null
  communityPresetAvatar: string | null
  communityAvatarPath: string | null
  identityComplete: boolean
  supplementaryComplete: boolean
  personalityComplete: boolean
  quizComplete: boolean
}

export interface CommunityMemberProfileMetrics {
  profileId: string
  schoolName: string | null
  level: MemberLevel
  compatibilityScore: number | null
  compatibilityStatus: CompatibilityStatus
  activityCount: number
}

export interface ProfileAuditEntry {
  id: number
  actionType: ProfileAuditAction
  changedFields: string[]
  beforeValues: Record<string, unknown>
  afterValues: Record<string, unknown>
  reason: string | null
  actorAdminId: string | null
  actorName: string | null
  createdAt: string
}

export interface AdminMemberProfileMetrics {
  memberId: string
  personalAvatarPath: string | null
  personalAvatarUrl: string | null
  level: MemberLevel
  compatibilityScore: number
  compatibilityStatus: CompatibilityStatus
  internalNote: string
  scoreSource: ProfileScoreSource
  publishedAt: string | null
  publishedBy: string | null
  updatedAt: string
  updatedBy: string | null
  activityCount: number
  lastActivityAt: string | null
  latestAudit: ProfileAuditEntry | null
}

export interface UpdateMyProfileInput {
  fullName: string
  gender: "male" | "female" | "other"
  nickname: string | null
  schoolName: string | null
  department: string | null
  personalAvatarPath: string | null
}

export interface UpdateAdminMemberProfileMetricsInput {
  memberId: string
  level: MemberLevel
  compatibilityScore: number
  compatibilityStatus: CompatibilityStatus
  internalNote: string
  scoreSource: ProfileScoreSource
  auditReason: string
}
