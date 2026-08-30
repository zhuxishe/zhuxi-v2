export interface LineMemberInsertInput {
  userId: string
  email: string
  lineUserId: string
  linkedAt: string
}

export interface LineMemberWriteError {
  code?: string
  message?: string
}

interface LineMemberWriteClient {
  from(table: string): {
    insert(values: Record<string, unknown>): PromiseLike<{
      error: LineMemberWriteError | null
    }>
  }
}

interface LineIdentityRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>
  ): PromiseLike<{
    data: unknown
    error: LineMemberWriteError | null
  }>
}

export type LineIdentityOperation = "bind" | "unbind"

export interface ServiceLineIdentityInput {
  userId: string
  lineUserId: string
  operation: LineIdentityOperation
}

export interface AuthUserForLineBridge {
  email?: string | null
  app_metadata?: Record<string, unknown> | null
}

export interface PublicLineIdentityError {
  status: number
  code: string
  message: string
}

const LINE_USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,255}$/

export function isValidLineUserId(value: unknown): value is string {
  return typeof value === "string" && LINE_USER_ID_PATTERN.test(value)
}

export function buildLineBridgeEmail(lineUserId: string) {
  return `line_${lineUserId}@line.zhuxi.app`
}

/**
 * A LINE id may also be attached to a normal email/Google Auth account. Only
 * Auth users created by the LINE bridge have the deterministic credentials
 * required by /api/auth/line. The app_metadata marker is authoritative for
 * new records; the exact synthetic email preserves compatibility with records
 * created before the marker existed.
 */
export function isLineBridgeAuthUser(
  authUser: AuthUserForLineBridge | null | undefined,
  lineUserId: string
) {
  if (!authUser) return false
  const expectedEmail = buildLineBridgeEmail(lineUserId).toLowerCase()
  if (authUser.email?.toLowerCase() !== expectedEmail) return false

  const origin = authUser.app_metadata?.auth_origin
  const metadataLineId = authUser.app_metadata?.line_user_id
  if (origin === undefined && metadataLineId === undefined) return true
  return origin === "line_bridge" && metadataLineId === lineUserId
}

export async function serviceSetMemberLineIdentity(
  client: unknown,
  input: ServiceLineIdentityInput
) {
  const rpcClient = client as LineIdentityRpcClient
  return rpcClient.rpc("service_set_member_line_identity", {
    p_user_id: input.userId,
    p_line_user_id: input.lineUserId,
    p_operation: input.operation,
  })
}

export function toPublicLineIdentityError(
  error: LineMemberWriteError | null | undefined
): PublicLineIdentityError {
  switch (error?.message) {
    case "MEMBER_MASTER_LINE_IDENTITY_CONFLICT":
    case "MEMBER_MASTER_LINE_IDENTITY_ALREADY_BOUND":
      return {
        status: 409,
        code: "line_identity_conflict",
        message: "This LINE account cannot be linked to this user",
      }
    case "MEMBER_MASTER_LINE_IDENTITY_MISMATCH":
      return {
        status: 409,
        code: "line_identity_changed",
        message: "The LINE account link has changed; refresh and try again",
      }
    case "MEMBER_MASTER_LINE_IDENTITY_INVALID":
    case "MEMBER_MASTER_LINE_IDENTITY_OPERATION_INVALID":
      return {
        status: 400,
        code: "line_identity_invalid",
        message: "Invalid LINE account request",
      }
    case "MEMBER_MASTER_ACCOUNT_BLOCKED":
      return {
        status: 403,
        code: "account_unavailable",
        message: "This account is unavailable",
      }
    case "MEMBER_MASTER_NOT_FOUND":
      return {
        status: 409,
        code: "member_record_unavailable",
        message: "Member record is unavailable",
      }
    default:
      return {
        status: 500,
        code: "line_identity_update_failed",
        message: "LINE account update failed",
      }
  }
}

export function getLineIdentityDiagnostic(
  error: LineMemberWriteError | null | undefined
) {
  return [error?.code, error?.message?.startsWith("MEMBER_MASTER_") ? error.message : null]
    .filter(Boolean)
    .join(":") || "UNKNOWN"
}

export function buildLineMemberInsert(input: LineMemberInsertInput) {
  return {
    user_id: input.userId,
    email: input.email,
    line_user_id: input.lineUserId,
    status: "pending" as const,
    account_status: "active" as const,
    profile_stage: "not_started" as const,
    record_source: "line" as const,
    account_linked_at: input.linkedAt,
    onboarding_step: 0,
  }
}

export async function insertLineMemberRecord(
  client: unknown,
  input: LineMemberInsertInput
) {
  const writeClient = client as LineMemberWriteClient
  return writeClient.from("members").insert(buildLineMemberInsert(input))
}
