/**
 * 类型集中导出 — re-export 入口
 */

// Member types
export type { MemberStatus, Gender, DegreeLevel, PreInterviewFormData, PlayerProfile, PlayerMatchResult } from "./member-types"
export { EMPTY_FORM } from "./member-types"

// Admin types
export type { RiskLevel, AdminRole, AdminUser, MemberWithIdentity, InterviewEvalFormData } from "./admin-types"

// Member detail (admin)
export type {
  MemberIdentityRow, InterviewEvaluationRow, MemberLanguageRow,
  MemberInterestsRow, MemberPersonalityRow, MemberBoundariesRow,
  MemberVerificationRow, MemberDetail,
} from "./member-detail"

// Unified admin member directory and 360 detail
export type {
  Member360, Member360Account, Member360Capabilities, Member360Core,
  MemberAuditEvent, MemberAuditPage, MemberCenterRecord, MemberCommunitySummary,
  MemberDirectoryFilters, MemberDirectoryItem, MemberDirectoryPage,
  MemberDuplicateResolutionResult, MemberFeedbackSummary, MemberHardDeleteResult,
  MemberLifecyclePreflight, MemberMatchingSummary,
  MemberSectionUpdateResult,
} from "./member-center"

// Form types
export type { SupplementaryFormData, PersonalitySelfData, TagOption, TagCategory } from "./form-types"
export { EMPTY_SUPPLEMENTARY, EMPTY_PERSONALITY } from "./form-types"

// Player feedback
export type {
  AdminFeedbackActionState, PlayerFeedbackActionState, PlayerFeedbackCategory,
  PlayerFeedbackRow, PlayerFeedbackStatus,
} from "./player-feedback"
export { PLAYER_FEEDBACK_CATEGORIES, PLAYER_FEEDBACK_STATUSES } from "./player-feedback"
