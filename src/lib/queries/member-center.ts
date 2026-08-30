import { createClient } from "@/lib/supabase/server"
import type {
  Member360,
  Member360Account,
  Member360Core,
  MemberAuditEvent,
  MemberAuditPage,
  MemberCenterRecord,
  MemberDirectoryFilters,
  MemberDirectoryItem,
  MemberDirectoryPage,
  MemberDetail,
  MemberDuplicateResolutionResult,
  MemberHardDeleteResult,
  MemberLifecyclePreflight,
  MemberSectionUpdateResult,
} from "@/types"

type RpcFailure = {
  code?: string
  message: string
  details?: string
  hint?: string
}

interface MemberCenterRpcClient {
  rpc<T>(name: string, args?: Record<string, unknown>): PromiseLike<{
    data: T | null
    error: RpcFailure | null
  }>
}

export class MemberCenterRpcError extends Error {
  readonly code?: string
  readonly details?: string
  readonly hint?: string

  constructor(operation: string, failure: RpcFailure) {
    super(`${operation}: ${failure.message}`)
    this.name = "MemberCenterRpcError"
    this.code = failure.code
    this.details = failure.details
    this.hint = failure.hint
  }
}

function asRecord(value: unknown): MemberCenterRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as MemberCenterRecord
}

function asRecordArray(value: unknown): MemberCenterRecord[] {
  if (!Array.isArray(value)) return []
  return value.map(asRecord).filter((item): item is MemberCenterRecord => item !== null)
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function requiredString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function normalizeDirectoryItem(value: unknown): MemberDirectoryItem | null {
  const item = asRecord(value)
  if (!item) return null
  const memberId = nullableString(item.member_id)
  if (!memberId) return null

  return {
    memberId,
    fullName: nullableString(item.full_name),
    nickname: nullableString(item.nickname),
    email: nullableString(item.email),
    authEmail: nullableString(item.auth_email),
    authProviders: stringArray(item.auth_providers),
    schoolName: nullableString(item.school_name),
    status: requiredString(item.status, "unknown"),
    profileStage: nullableString(item.profile_stage),
    recordSource: nullableString(item.record_source),
    onboardingStep: nullableNumber(item.onboarding_step),
    lastProfileSavedAt: nullableString(item.last_profile_saved_at),
    submittedAt: nullableString(item.submitted_at),
    createdAt: requiredString(item.created_at),
    updatedAt: requiredString(item.updated_at),
    memberNumber: nullableString(item.member_number),
    accountStatus: nullableString(item.account_status),
    authBound: nullableBoolean(item.auth_bound),
    hasLegacyRecord: item.has_legacy_record === true,
    legacyRecordCount: Math.max(0, nullableNumber(item.legacy_record_count) ?? 0),
  }
}

export function normalizeMemberDirectoryResponse(
  value: unknown,
  fallback: Pick<MemberDirectoryFilters, "page" | "pageSize">,
): MemberDirectoryPage {
  const payload = asRecord(value) ?? {}
  const page = positiveInteger(payload.page, fallback.page)
  const pageSize = positiveInteger(payload.page_size, fallback.pageSize)
  const items = (Array.isArray(payload.items) ? payload.items : [])
    .map(normalizeDirectoryItem)
    .filter((item): item is MemberDirectoryItem => item !== null)
  const total = Math.max(0, nullableNumber(payload.total) ?? items.length)
  const totalPages = Math.max(
    total > 0 ? 1 : 0,
    nullableNumber(payload.total_pages) ?? Math.ceil(total / pageSize),
  )

  return { page, pageSize, total, totalPages, items, redactedFields: stringArray(payload.redacted_fields) }
}

function normalizeCore(value: unknown): Member360Core {
  const member = asRecord(value) ?? {}
  const memberId = nullableString(member.member_id)
  if (!memberId) throw new Error("成员 360 数据缺少 canonical member_id")

  return {
    raw: member,
    memberId,
    email: nullableString(member.email),
    status: requiredString(member.status, "unknown"),
    profileStage: nullableString(member.profile_stage),
    recordSource: nullableString(member.record_source),
    onboardingStep: nullableNumber(member.onboarding_step),
    lastProfileSavedAt: nullableString(member.last_profile_saved_at),
    submittedAt: nullableString(member.submitted_at),
    createdAt: requiredString(member.created_at),
    updatedAt: requiredString(member.updated_at),
    membershipType: nullableString(member.membership_type),
    interviewDate: nullableString(member.interview_date),
    interviewer: nullableString(member.interviewer),
    attractivenessScore: nullableNumber(member.attractiveness_score),
  }
}

function normalizeAccount(value: unknown): Member360Account | null {
  const account = asRecord(value)
  if (!account) return null
  return {
    raw: account,
    memberNumber: nullableString(account.member_number),
    accountStatus: nullableString(account.account_status),
    authBound: nullableBoolean(account.auth_bound),
    recordSource: nullableString(account.record_source),
    userId: nullableString(account.user_id),
    authEmail: nullableString(account.auth_email),
    authProviders: stringArray(account.auth_providers),
    authCreatedAt: nullableString(account.auth_created_at ?? account.auth_user_created_at),
    authLastSignInAt: nullableString(account.auth_last_sign_in_at ?? account.last_sign_in_at),
    lineUserId: nullableString(account.line_user_id),
    wechatOpenid: nullableString(account.wechat_openid),
    accountLinkedAt: nullableString(account.account_linked_at),
    anonymizedAt: nullableString(account.anonymized_at),
  }
}

export function normalizeMember360Response(value: unknown): Member360 {
  const payload = asRecord(value)
  if (!payload) throw new Error("成员 360 RPC 返回了无效数据")
  const capabilities = asRecord(payload.capabilities)

  return {
    capabilities: {
      isSuperAdmin: capabilities?.is_super_admin === true,
      redactedFields: stringArray(capabilities?.redacted_fields),
    },
    member: normalizeCore(payload.member),
    account: normalizeAccount(payload.account ?? payload.high_risk),
    identity: asRecord(payload.identity),
    language: asRecord(payload.language),
    interests: asRecord(payload.interests),
    personality: asRecord(payload.personality),
    boundaries: asRecord(payload.boundaries),
    verification: asRecord(payload.verification),
    quiz: asRecord(payload.quiz),
    dynamicStats: asRecord(payload.dynamic_stats),
    profileMetrics: asRecord(payload.profile_metrics),
    interviewEvaluations: asRecordArray(payload.interview_evaluations),
    staffProfiles: asRecordArray(payload.staff_profiles),
    matchRoundSubmissions: asRecordArray(payload.match_round_submissions),
    unmatchedDiagnostics: asRecordArray(payload.unmatched_diagnostics),
    scriptPlayRecords: asRecordArray(payload.script_play_records),
    roles: asRecordArray(payload.roles),
    legacyRecords: asRecordArray(payload.legacy_records),
    community: asRecord(payload.community),
    feedback: asRecord(payload.feedback),
    matching: asRecord(payload.matching),
    audit: payload.audit === null ? null : asRecordArray(payload.audit) as MemberAuditEvent[],
    auditTotal: nullableNumber(payload.audit_total) ?? 0,
    duplicateCandidates: asRecordArray(payload.duplicate_candidates),
  }
}

export function normalizeMemberAuditPageResponse(
  value: unknown,
  fallback: { memberId: string; page: number; pageSize: number },
): MemberAuditPage {
  const payload = asRecord(value) ?? {}
  const page = positiveInteger(payload.page, fallback.page)
  const pageSize = positiveInteger(payload.page_size, fallback.pageSize)
  const items = asRecordArray(payload.items) as MemberAuditEvent[]
  const total = Math.max(0, nullableNumber(payload.total) ?? items.length)
  const totalPages = Math.max(total > 0 ? 1 : 0, nullableNumber(payload.total_pages) ?? Math.ceil(total / pageSize))
  return {
    memberId: nullableString(payload.member_id) ?? fallback.memberId,
    page,
    pageSize,
    total,
    totalPages,
    items,
    redactedFields: stringArray(payload.redacted_fields),
  }
}

function normalizeSectionResult(value: unknown): MemberSectionUpdateResult {
  const payload = asRecord(value) ?? {}
  return {
    memberId: requiredString(payload.member_id),
    section: requiredString(payload.section),
    updatedAt: nullableString(payload.updated_at),
    changedFields: Array.isArray(payload.changed_fields)
      ? payload.changed_fields.filter((field): field is string => typeof field === "string")
      : [],
    eventId: typeof payload.event_id === "number" || typeof payload.event_id === "string"
      ? payload.event_id
      : null,
    data: asRecord(payload.data),
    restoredFromEventId: typeof payload.restored_from_event_id === "number" || typeof payload.restored_from_event_id === "string"
      ? payload.restored_from_event_id
      : null,
    userId: nullableString(payload.user_id ?? asRecord(payload.data)?.user_id),
  }
}

async function rpc<T>(operation: string, args: Record<string, unknown>): Promise<T> {
  const client = await createClient() as unknown as MemberCenterRpcClient
  const { data, error } = await client.rpc<T>(operation, args)
  if (error) throw new MemberCenterRpcError(operation, error)
  if (data === null) throw new Error(`${operation}: 数据库未返回结果`)
  return data
}

function optionalFilter(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized && normalized !== "all" ? normalized : null
}

export function buildMemberDirectoryRpcArgs(filters: MemberDirectoryFilters): Record<string, unknown> {
  return {
    p_page: filters.page,
    p_page_size: filters.pageSize,
    p_search: optionalFilter(filters.search),
    p_status: optionalFilter(filters.status),
    p_account_status: optionalFilter(filters.accountStatus),
    p_profile_stage: optionalFilter(filters.profileStage),
    p_record_source: optionalFilter(filters.recordSource),
  }
}

export async function fetchMemberDirectory(filters: MemberDirectoryFilters): Promise<MemberDirectoryPage> {
  const raw = await rpc<unknown>("admin_list_member_directory", buildMemberDirectoryRpcArgs(filters))
  return normalizeMemberDirectoryResponse(raw, filters)
}

export async function fetchMember360(memberId: string): Promise<Member360> {
  const raw = await rpc<unknown>("admin_get_member_360", { p_member_id: memberId })
  return normalizeMember360Response(raw)
}

export async function fetchMemberAudit(input: {
  memberId: string
  page: number
  pageSize?: number
}): Promise<MemberAuditPage> {
  const pageSize = input.pageSize ?? 100
  const raw = await rpc<unknown>("admin_list_member_audit", {
    p_member_id: input.memberId,
    p_page: input.page,
    p_page_size: pageSize,
  })
  return normalizeMemberAuditPageResponse(raw, {
    memberId: input.memberId,
    page: input.page,
    pageSize,
  })
}

/** Temporary compatibility shape for the existing section-specific edit forms. */
export function member360ToLegacyDetail(data: Member360): MemberDetail {
  return {
    id: data.member.memberId,
    member_number: data.account?.memberNumber ?? null,
    status: data.member.status,
    email: data.account?.authEmail ?? data.member.email,
    interview_date: data.member.interviewDate,
    interviewer: data.member.interviewer,
    attractiveness_score: data.member.attractivenessScore,
    membership_type: data.member.membershipType ?? "standard",
    line_user_id: data.account?.lineUserId ?? null,
    user_id: data.account?.userId ?? null,
    created_at: data.member.createdAt,
    updated_at: data.member.updatedAt,
    member_identity: data.identity,
    interview_evaluations: data.interviewEvaluations,
    member_language: data.language,
    member_interests: data.interests,
    member_personality: data.personality,
    personality_quiz_results: data.quiz,
    member_boundaries: data.boundaries,
    member_verification: data.verification,
  } as unknown as MemberDetail
}

export async function updateMemberSection(input: {
  memberId: string
  section: string
  payload: MemberCenterRecord
  reason: string
  expectedUpdatedAt?: string | null
}): Promise<MemberSectionUpdateResult> {
  const raw = await rpc<unknown>("admin_update_member_section", {
    p_member_id: input.memberId,
    p_section: input.section,
    p_payload: input.payload,
    p_reason: input.reason,
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
  })
  return normalizeSectionResult(raw)
}

export async function upsertLegacyMemberRecord(input: {
  legacyId: string | null
  payload: MemberCenterRecord
  reason: string
}): Promise<MemberCenterRecord> {
  const raw = await rpc<unknown>("admin_upsert_legacy_member", {
    p_legacy_id: input.legacyId,
    p_payload: input.payload,
    p_reason: input.reason,
  })
  return asRecord(raw) ?? {}
}

export async function restoreMemberEvent(eventId: number | string, reason: string): Promise<MemberSectionUpdateResult> {
  const raw = await rpc<unknown>("admin_restore_member_event", {
    p_event_id: eventId,
    p_reason: reason,
  })
  return normalizeSectionResult(raw)
}

export async function fetchMemberLifecyclePreflight(memberId: string): Promise<MemberLifecyclePreflight> {
  const raw = await rpc<unknown>("admin_preflight_member_lifecycle", { p_member_id: memberId })
  return asRecord(raw) ?? {}
}

export async function setMemberAccountStatus(input: {
  memberId: string
  accountStatus: "active" | "suspended" | "closed"
  reason: string
}): Promise<MemberSectionUpdateResult> {
  const raw = await rpc<unknown>("admin_set_member_account_status", {
    p_member_id: input.memberId,
    p_account_status: input.accountStatus,
    p_reason: input.reason,
  })
  return normalizeSectionResult(raw)
}

export async function anonymizeMember(memberId: string, reason: string): Promise<MemberSectionUpdateResult> {
  const raw = await rpc<unknown>("admin_anonymize_member", {
    p_member_id: memberId,
    p_reason: reason,
  })
  return normalizeSectionResult(raw)
}

export async function resolveMemberDuplicateCandidate(input: {
  candidateId: number | string
  resolution: "confirmed_duplicate" | "not_duplicate"
  reason: string
}): Promise<MemberDuplicateResolutionResult> {
  const raw = await rpc<unknown>("admin_resolve_member_duplicate_candidate", {
    p_candidate_id: input.candidateId,
    p_resolution: input.resolution,
    p_reason: input.reason,
  })
  return asRecord(raw) ?? {}
}

export async function hardDeleteBlankMember(input: {
  memberId: string
  confirmation: string
  reason: string
}): Promise<MemberHardDeleteResult> {
  const raw = await rpc<unknown>("admin_hard_delete_blank_member", {
    p_member_id: input.memberId,
    p_confirm_member_id: input.confirmation,
    p_reason: input.reason,
  })
  return asRecord(raw) ?? {}
}

export async function completeMemberAuthDelete(input: {
  memberId: string
  authUserId: string
  reason: string
}): Promise<MemberCenterRecord> {
  const raw = await rpc<unknown>("admin_complete_member_auth_delete", {
    p_member_id: input.memberId,
    p_auth_user_id: input.authUserId,
    p_reason: input.reason,
  })
  return asRecord(raw) ?? {}
}

export function memberCenterErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("SUPER_ADMIN_REQUIRED")) return "仅超级管理员可以执行此操作"
  if (message.includes("ADMIN_REQUIRED")) return "管理员身份已失效，请重新登录"
  if (message.includes("MEMBER_NOT_FOUND") || message.includes("MEMBER_MASTER_NOT_FOUND")) return "成员不存在或已被删除"
  if (message.includes("REASON_REQUIRED")) return "请填写本次修改原因"
  if (message.includes("MEMBER_NUMBER_TAKEN")) return "该会员编号已被其他成员使用"
  if (message.includes("MEMBER_NUMBER_INVALID")) return "会员编号格式无效"
  if (message.includes("IDENTITY_REQUIRED_FIELDS_MISSING") || message.includes("IDENTITY_REQUIRED")) {
    return "首次建立基本信息时，请同时填写姓名、性别、年龄段、国籍和所在地"
  }
  if (message.includes("NICKNAME_CONFLICT")) return "昵称已被其他成员使用，请更换后重试"
  if (message.includes("PAYLOAD_INVALID")) return "资料格式无效，请检查字段内容后重试"
  if (message.includes("RESTORE_NO_CHANGES")) return "当前资料已与该历史版本一致，无需恢复"
  if (message.includes("EVENT_NOT_RESTORABLE")) return "该事件没有可恢复的历史版本"
  if (message.includes("LEGACY_MEMBER_NUMBER_CONFLICT")) return "该历史会员编号已被其他旧记录使用"
  if (message.includes("LEGACY_NOT_FOUND")) return "历史来源记录不存在，请刷新后重试"
  if (message.includes("LEGACY_CLAIM_LINK_REQUIRED")) return "该旧记录尚未绑定认领成员，不能直接标记为 approved"
  if (message.includes("ACCOUNT_STATUS_TERMINAL") || message.includes("CLOSED_ACCOUNT_TERMINAL")) return "账号已关闭，不能重新启用或暂停"
  if (message.includes("INVALID_ACCOUNT_STATUS")) return "账号状态不受支持"
  if (message.includes("ANONYMIZATION_BLOCKED")) return "存在阻断条件，当前不能匿名化；请重新运行影响预检"
  if (message.includes("ANONYMIZED_RECORD_LOCKED")) return "该成员已匿名化，资料不可继续修改"
  if (message.includes("ANONYMIZED_RESTORE_BLOCKED")) return "该成员已匿名化，不能恢复旧资料"
  if (message.includes("HARD_DELETE_BLOCKED")) return "硬删除条件已变化或存在关联记录；请重新运行影响预检"
  if (message.includes("DELETE_CONFIRMATION_MISMATCH")) return "硬删除确认 ID 与 canonical member ID 不一致"
  if (message.includes("DUPLICATE_ALREADY_RESOLVED")) return "该重复候选已由其他管理员处理，请刷新页面"
  if (message.includes("DUPLICATE_RESOLUTION_INVALID")) return "重复候选处置值无效"
  if (message.includes("EVENT_NOT_RESTORABLE")) return "该审计事件不能安全恢复"
  if (message.includes("STALE_UPDATE")) return "资料已被其他管理员更新，请刷新后重试"
  if (message.includes("INVALID_SECTION") || message.includes("SECTION_INVALID")) return "该资料分区不支持此修改"
  return "操作失败，请刷新后重试；如问题持续，请联系系统管理员"
}

export function isMemberNotFoundError(error: unknown): boolean {
  return error instanceof Error && (
    error.message.includes("MEMBER_NOT_FOUND")
    || error.message.includes("MEMBER_MASTER_NOT_FOUND")
  )
}
