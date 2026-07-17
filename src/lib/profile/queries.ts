import type { PostgrestError } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import type {
  AdminMemberProfileMetrics,
  CommunityMemberProfileMetrics,
  CompatibilityStatus,
  MemberLevel,
  PlayerProfileSummary,
  ProfileAuditAction,
  ProfileAuditEntry,
  ProfileScoreSource,
  UpdateAdminMemberProfileMetricsInput,
  UpdateMyProfileInput,
} from "./types"
import {
  PROFILE_NICKNAME_ERRORS,
  validateAdminProfileMetrics,
  validateUpdateMyProfile,
  type ProfileFieldError,
  type ProfileNicknameErrorCode,
} from "./validation"

export type {
  AdminMemberProfileMetrics,
  CommunityMemberProfileMetrics,
  PlayerProfileSummary,
  ProfileAuditEntry,
  UpdateAdminMemberProfileMetricsInput,
  UpdateMyProfileInput,
} from "./types"

interface RpcClient {
  rpc<Name extends keyof ProfileRpcMap>(
    name: Name,
    args?: ProfileRpcMap[Name]["args"],
  ): PromiseLike<{
    data: ProfileRpcMap[Name]["returns"] | null
    error: PostgrestError | null
  }>
}

type ProfileDataErrorCode =
  | ProfileFieldError
  | ProfileNicknameErrorCode
  | "PROFILE_NOT_FOUND"
  | "PROFILE_RESPONSE_INVALID"
  | "PROFILE_LEVEL_INVALID"
  | "PROFILE_COMPATIBILITY_SCORE_INVALID"
  | "PROFILE_COMPATIBILITY_STATUS_INVALID"
  | "PROFILE_SCORE_SOURCE_INVALID"
  | "PROFILE_INTERNAL_NOTE_INVALID"
  | "PROFILE_AUDIT_REASON_INVALID"
  | "PROFILE_REQUEST_FAILED"

export class ProfileDataError extends Error {
  constructor(
    public readonly code: ProfileDataErrorCode,
    message: string = code,
    public readonly causeError?: PostgrestError,
  ) {
    super(message)
    this.name = "ProfileDataError"
  }
}

interface PlayerProfileSummaryRow {
  member_id: string
  member_number: string | null
  status: string
  email: string | null
  line_user_id: string | null
  full_name: string
  gender: "male" | "female" | "other"
  nickname: string | null
  school_name: string | null
  department: string | null
  personal_avatar_path: string | null
  level: number
  compatibility_score: number | null
  compatibility_status: CompatibilityStatus
  activity_count: number
  last_activity_at: string | null
  community_profile_id: string | null
  community_avatar_kind: "default" | "preset" | "personal" | null
  community_avatar_path: string | null
  community_preset_avatar: string | null
  identity_complete: boolean
  supplementary_complete: boolean
  personality_complete: boolean
  quiz_complete: boolean
}

interface CommunityMemberProfileMetricsRow {
  profile_id: string
  school_name: string | null
  level: number
  compatibility_score: number | null
  compatibility_status: CompatibilityStatus
  activity_count: number
}

interface ProfileAuditRow {
  id: number
  action_type: ProfileAuditAction
  changed_fields: string[]
  before_values: Record<string, unknown>
  after_values: Record<string, unknown>
  reason: string | null
  actor_admin_id: string | null
  actor_name: string | null
  created_at: string
}

interface AdminMemberProfileMetricsRow {
  member_id: string
  personal_avatar_path: string | null
  level: number
  compatibility_score: number
  compatibility_status: CompatibilityStatus
  internal_note: string
  score_source: ProfileScoreSource
  published_at: string | null
  published_by: string | null
  updated_at: string
  updated_by: string | null
  activity_count: number
  last_activity_at: string | null
  latest_audit: ProfileAuditRow | null
}

interface ProfileRpcMap {
  get_my_profile_summary: {
    args: undefined
    returns: PlayerProfileSummaryRow
  }
  update_my_profile: {
    args: {
      p_full_name: string
      p_gender: "male" | "female" | "other"
      p_nickname: string | null
      p_school_name: string | null
      p_department: string | null
      p_personal_avatar_path: string | null
    }
    returns: PlayerProfileSummaryRow
  }
  get_community_member_profile_metrics: {
    args: { p_profile_id: string }
    returns: CommunityMemberProfileMetricsRow
  }
  admin_get_member_profile_metrics: {
    args: { p_member_id: string }
    returns: AdminMemberProfileMetricsRow
  }
  admin_get_member_profile_audit: {
    args: { p_member_id: string; p_limit: number }
    returns: ProfileAuditRow[]
  }
  admin_update_member_profile_metrics: {
    args: {
      p_member_id: string
      p_level: MemberLevel
      p_compatibility_score: number
      p_compatibility_status: CompatibilityStatus
      p_internal_note: string
      p_score_source: ProfileScoreSource
      p_audit_reason: string
    }
    returns: AdminMemberProfileMetricsRow
  }
  admin_recalculate_member_activity_stats: {
    args: { p_member_id: string | null; p_audit_reason: string }
    returns: { recalculated_members: number }
  }
}

function profileAvatarUrl(path: string | null, audience: "member" | "admin" = "member") {
  if (!path) return null
  const params = new URLSearchParams({ bucket: "community-avatars", path })
  if (audience === "admin") params.set("audience", "admin")
  return `/api/community/media?${params.toString()}`
}

function memberLevel(value: number): MemberLevel {
  if (value === 1 || value === 2 || value === 3) return value
  throw new ProfileDataError("PROFILE_RESPONSE_INVALID", "Unexpected member level")
}

function auditEntry(row: ProfileAuditRow | null): ProfileAuditEntry | null {
  if (!row) return null
  return {
    id: row.id,
    actionType: row.action_type,
    changedFields: row.changed_fields,
    beforeValues: row.before_values,
    afterValues: row.after_values,
    reason: row.reason,
    actorAdminId: row.actor_admin_id,
    actorName: row.actor_name,
    createdAt: row.created_at,
  }
}

function throwRpcError(error: PostgrestError): never {
  const stableCode = PROFILE_NICKNAME_ERRORS.find((code) => error.message.includes(code))
  if (stableCode) throw new ProfileDataError(stableCode, error.message, error)
  throw new ProfileDataError("PROFILE_REQUEST_FAILED", error.message, error)
}

async function callProfileRpc<Name extends keyof ProfileRpcMap>(
  name: Name,
  args?: ProfileRpcMap[Name]["args"],
) {
  const client = await createClient()
  const { data, error } = await (client as unknown as RpcClient).rpc(name, args)
  if (error) throwRpcError(error)
  return data
}

export async function fetchMyProfileSummary(): Promise<PlayerProfileSummary> {
  const row = await callProfileRpc("get_my_profile_summary")
  if (!row) throw new ProfileDataError("PROFILE_NOT_FOUND")
  return mapPlayerProfileSummary(row)
}

function mapPlayerProfileSummary(row: PlayerProfileSummaryRow): PlayerProfileSummary {
  return {
    memberId: row.member_id,
    memberNumber: row.member_number,
    status: row.status,
    email: row.email,
    lineUserId: row.line_user_id,
    fullName: row.full_name,
    gender: row.gender,
    nickname: row.nickname,
    schoolName: row.school_name,
    department: row.department,
    personalAvatarPath: row.personal_avatar_path,
    personalAvatarUrl: profileAvatarUrl(row.personal_avatar_path),
    level: memberLevel(row.level),
    compatibilityScore: row.compatibility_score,
    compatibilityStatus: row.compatibility_status,
    activityCount: row.activity_count,
    lastActivityAt: row.last_activity_at,
    communityProfileId: row.community_profile_id,
    communityAvatarKind: row.community_avatar_kind,
    communityPresetAvatar: row.community_preset_avatar,
    communityAvatarPath: row.community_avatar_path,
    identityComplete: row.identity_complete,
    supplementaryComplete: row.supplementary_complete,
    personalityComplete: row.personality_complete,
    quizComplete: row.quiz_complete,
  }
}

export async function updateMyProfile(input: UpdateMyProfileInput): Promise<PlayerProfileSummary> {
  const validationError = validateUpdateMyProfile(input)
  if (validationError) throw new ProfileDataError(validationError)
  const row = await callProfileRpc("update_my_profile", {
    p_full_name: input.fullName,
    p_gender: input.gender,
    p_nickname: input.nickname,
    p_school_name: input.schoolName,
    p_department: input.department,
    p_personal_avatar_path: input.personalAvatarPath,
  })
  if (!row) throw new ProfileDataError("PROFILE_NOT_FOUND")
  // The mutation RPC already returns the committed summary. Mapping that
  // response avoids reporting a false save failure if a redundant second read
  // were to fail after the transaction has committed.
  return mapPlayerProfileSummary(row)
}

export async function fetchCommunityMemberProfileMetrics(
  profileId: string,
): Promise<CommunityMemberProfileMetrics | null> {
  const row = await callProfileRpc(
    "get_community_member_profile_metrics",
    { p_profile_id: profileId },
  )
  if (!row) return null
  return {
    profileId: row.profile_id,
    schoolName: row.school_name,
    level: memberLevel(row.level),
    compatibilityScore: row.compatibility_score,
    compatibilityStatus: row.compatibility_status,
    activityCount: row.activity_count,
  }
}

export async function fetchAdminMemberProfileMetrics(
  memberId: string,
): Promise<AdminMemberProfileMetrics> {
  const row = await callProfileRpc(
    "admin_get_member_profile_metrics",
    { p_member_id: memberId },
  )
  if (!row) throw new ProfileDataError("PROFILE_NOT_FOUND")
  return {
    memberId: row.member_id,
    personalAvatarPath: row.personal_avatar_path,
    personalAvatarUrl: profileAvatarUrl(row.personal_avatar_path, "admin"),
    level: memberLevel(row.level),
    compatibilityScore: row.compatibility_score,
    compatibilityStatus: row.compatibility_status,
    internalNote: row.internal_note,
    scoreSource: row.score_source,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    activityCount: row.activity_count,
    lastActivityAt: row.last_activity_at,
    latestAudit: auditEntry(row.latest_audit),
  }
}

export async function fetchAdminMemberProfileAudit(memberId: string, limit = 20) {
  const rows = await callProfileRpc("admin_get_member_profile_audit", {
    p_member_id: memberId,
    p_limit: limit,
  })
  return (rows ?? []).map((row) => auditEntry(row) as ProfileAuditEntry)
}

export async function updateAdminMemberProfileMetrics(
  input: UpdateAdminMemberProfileMetricsInput,
): Promise<AdminMemberProfileMetrics> {
  const validationError = validateAdminProfileMetrics(input)
  if (validationError) throw new ProfileDataError(validationError as ProfileDataErrorCode)
  const row = await callProfileRpc(
    "admin_update_member_profile_metrics",
    {
      p_member_id: input.memberId,
      p_level: input.level,
      p_compatibility_score: input.compatibilityScore,
      p_compatibility_status: input.compatibilityStatus,
      p_internal_note: input.internalNote,
      p_score_source: input.scoreSource,
      p_audit_reason: input.auditReason,
    },
  )
  if (!row) throw new ProfileDataError("PROFILE_NOT_FOUND")
  return {
    memberId: row.member_id,
    personalAvatarPath: row.personal_avatar_path,
    personalAvatarUrl: profileAvatarUrl(row.personal_avatar_path, "admin"),
    level: memberLevel(row.level),
    compatibilityScore: row.compatibility_score,
    compatibilityStatus: row.compatibility_status,
    internalNote: row.internal_note,
    scoreSource: row.score_source,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    activityCount: row.activity_count,
    lastActivityAt: row.last_activity_at,
    latestAudit: auditEntry(row.latest_audit),
  }
}

export async function recalculateAdminMemberActivityStats(
  memberId: string | null,
  auditReason = "活动次数重算",
): Promise<number> {
  const result = await callProfileRpc(
    "admin_recalculate_member_activity_stats",
    { p_member_id: memberId, p_audit_reason: auditReason },
  )
  if (!result
      || !Number.isInteger(result.recalculated_members)
      || result.recalculated_members < 0) {
    throw new ProfileDataError("PROFILE_RESPONSE_INVALID", "Unexpected activity recalculation response")
  }
  return result.recalculated_members
}
