export type MemberCenterRecord = Record<string, unknown>

export interface MemberDirectoryFilters {
  page: number
  pageSize: number
  search?: string | null
  status?: string | null
  accountStatus?: string | null
  profileStage?: string | null
  recordSource?: string | null
}

export interface MemberDirectoryItem {
  memberId: string
  fullName: string | null
  nickname: string | null
  email: string | null
  authEmail: string | null
  authProviders: string[]
  schoolName: string | null
  status: string
  profileStage: string | null
  recordSource: string | null
  onboardingStep: number | null
  lastProfileSavedAt: string | null
  submittedAt: string | null
  createdAt: string
  updatedAt: string
  memberNumber: string | null
  accountStatus: string | null
  authBound: boolean | null
  hasLegacyRecord: boolean
  legacyRecordCount: number
}

export interface MemberDirectoryPage {
  page: number
  pageSize: number
  total: number
  totalPages: number
  items: MemberDirectoryItem[]
  redactedFields: string[]
}

export interface Member360Capabilities {
  isSuperAdmin: boolean
  redactedFields: string[]
}

export interface Member360Core {
  raw: MemberCenterRecord
  memberId: string
  email: string | null
  status: string
  profileStage: string | null
  recordSource: string | null
  onboardingStep: number | null
  lastProfileSavedAt: string | null
  submittedAt: string | null
  createdAt: string
  updatedAt: string
  membershipType: string | null
  interviewDate: string | null
  interviewer: string | null
  attractivenessScore: number | null
}

export interface Member360Account {
  raw: MemberCenterRecord
  memberNumber: string | null
  accountStatus: string | null
  authBound: boolean | null
  recordSource: string | null
  userId: string | null
  authEmail: string | null
  authProviders: string[]
  authCreatedAt: string | null
  authLastSignInAt: string | null
  lineUserId: string | null
  wechatOpenid: string | null
  accountLinkedAt: string | null
  anonymizedAt: string | null
}

export interface MemberCommunitySummary extends MemberCenterRecord {
  profile_id?: string | null
  nickname?: string | null
  avatar_kind?: string | null
  avatar_path?: string | null
  preset_avatar?: string | null
  joined_at?: string | null
  non_anonymous_post_count?: number | null
  non_anonymous_comment_count?: number | null
  preferences?: MemberCenterRecord | null
}

export interface MemberFeedbackSummary extends MemberCenterRecord {
  total?: number | null
  pending?: number | null
  latest?: MemberCenterRecord[] | null
}

export interface MemberMatchingSummary extends MemberCenterRecord {
  match_count?: number | null
  reviews_written?: number | null
  reviews_received?: number | null
}

export interface MemberAuditEvent extends MemberCenterRecord {
  event_id?: number | string
  id?: number | string
  section?: string | null
  action?: string | null
  operation?: string | null
  reason?: string | null
  actor_name?: string | null
  created_at?: string | null
  changed_fields?: string[] | null
  before_values?: MemberCenterRecord | null
  after_values?: MemberCenterRecord | null
  restorable?: boolean | null
  values_redacted?: boolean | null
}

export interface MemberAuditPage {
  memberId: string
  page: number
  pageSize: number
  total: number
  totalPages: number
  items: MemberAuditEvent[]
  redactedFields: string[]
}

export interface Member360 {
  capabilities: Member360Capabilities
  member: Member360Core
  account: Member360Account | null
  identity: MemberCenterRecord | null
  language: MemberCenterRecord | null
  interests: MemberCenterRecord | null
  personality: MemberCenterRecord | null
  boundaries: MemberCenterRecord | null
  verification: MemberCenterRecord | null
  quiz: MemberCenterRecord | null
  dynamicStats: MemberCenterRecord | null
  profileMetrics: MemberCenterRecord | null
  interviewEvaluations: MemberCenterRecord[]
  staffProfiles: MemberCenterRecord[]
  matchRoundSubmissions: MemberCenterRecord[]
  unmatchedDiagnostics: MemberCenterRecord[]
  scriptPlayRecords: MemberCenterRecord[]
  roles: MemberCenterRecord[]
  legacyRecords: MemberCenterRecord[]
  community: MemberCommunitySummary | null
  feedback: MemberFeedbackSummary | null
  matching: MemberMatchingSummary | null
  audit: MemberAuditEvent[] | null
  auditTotal: number
  duplicateCandidates: MemberCenterRecord[]
}

export interface MemberSectionUpdateResult {
  memberId: string
  section: string
  updatedAt: string | null
  changedFields: string[]
  eventId: number | string | null
  data: MemberCenterRecord | null
  restoredFromEventId?: number | string | null
  userId?: string | null
}

export interface MemberLifecyclePreflight extends MemberCenterRecord {
  member_id?: string
  can_suspend?: boolean
  can_reactivate?: boolean
  can_close?: boolean
  can_anonymize?: boolean
  can_hard_delete?: boolean
  hard_delete_scope?: string
  auth_user_id_snapshot?: string | null
  auth_delete_completed_at?: string | null
  auth_operation_required?: boolean
  counts?: MemberCenterRecord
  blockers?: unknown[]
}

export interface MemberHardDeleteResult extends MemberCenterRecord {
  member_id?: string
  deleted?: boolean
  audit_event_id?: number | string
}

export interface MemberDuplicateResolutionResult extends MemberCenterRecord {
  candidate_id?: number | string
  status?: "confirmed_duplicate" | "not_duplicate"
  automatic_merge_performed?: boolean
}
