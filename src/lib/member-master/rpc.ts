import type {
  CanonicalMemberSnapshot,
  MemberMasterActionError,
  MemberMasterRecord,
  OnboardingSaveRecord,
  OnboardingStep,
} from "./types"

interface RpcErrorLike {
  code?: string
  message?: string
}

interface RpcResponse {
  data: unknown
  error: RpcErrorLike | null
}

interface MemberMasterRpcClient {
  rpc(
    name: string,
    args?: Record<string, unknown>
  ): PromiseLike<RpcResponse>
}

interface QueryResponse {
  data: unknown
  error: RpcErrorLike | null
}

interface MemberMasterQueryClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<QueryResponse>
      }
    }
  }
}

interface MemberIdentityResult extends Record<string, unknown> {
  full_name?: unknown
}

interface MemberSnapshotResult extends Record<string, unknown> {
  id?: unknown
  member_number?: unknown
  membership_type?: unknown
  status?: unknown
  account_status?: unknown
  profile_stage?: unknown
  onboarding_step?: unknown
  last_profile_saved_at?: unknown
  submitted_at?: unknown
  member_identity?: unknown
}

type MemberMasterOperation = "ensure" | "save" | "submit" | "read"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class MemberMasterRpcError extends Error {
  readonly operation: MemberMasterOperation
  readonly databaseCode: string | null
  readonly machineCode: string | null

  constructor(operation: MemberMasterOperation, error?: RpcErrorLike | null) {
    super(`Member master ${operation} failed`)
    this.name = "MemberMasterRpcError"
    this.operation = operation
    this.databaseCode = error?.code ?? null
    this.machineCode = error?.message?.startsWith("MEMBER_MASTER_")
      ? error.message
      : null
  }
}

export async function ensureMyMemberRecord(client: unknown): Promise<MemberMasterRecord> {
  const data = await invokeRpc(client, "ensure", "ensure_my_member_record")
  return parseMemberMasterRecord(data, "ensure")
}

export async function saveMyOnboardingStep(
  client: unknown,
  step: OnboardingStep,
  payload: Record<string, unknown>
): Promise<OnboardingSaveRecord> {
  const data = await invokeRpc(client, "save", "save_my_onboarding_step", {
    p_step: step,
    p_payload: payload,
  })
  const record = parseMemberMasterRecord(data, "save")
  const savedStep = readInteger(data, "saved_step", 1, 4) as OnboardingStep
  return { ...record, savedStep }
}

export async function submitMyOnboarding(client: unknown): Promise<MemberMasterRecord> {
  const data = await invokeRpc(client, "submit", "submit_my_onboarding")
  return parseMemberMasterRecord(data, "submit")
}

/**
 * Re-read the canonical row after ensure. This deliberately uses members.id,
 * never email or display name, so legacy rows cannot be claimed implicitly.
 */
export async function fetchCanonicalMemberSnapshot(
  client: unknown,
  memberId: string
): Promise<CanonicalMemberSnapshot | null> {
  const queryClient = client as MemberMasterQueryClient
  const { data, error } = await queryClient
    .from("members")
    .select(
      "id, member_number, membership_type, status, account_status, profile_stage, onboarding_step, last_profile_saved_at, submitted_at, member_identity(full_name)"
    )
    .eq("id", memberId)
    .maybeSingle()

  if (error) throw new MemberMasterRpcError("read", error)
  if (data === null) return null
  if (!isRecord(data)) throw new MemberMasterRpcError("read")

  const row = data as MemberSnapshotResult
  const identity = getSingleIdentity(row.member_identity)

  return {
    memberId: readUuid(row, "id"),
    memberNumber: readNullableString(row, "member_number"),
    membershipType: readNullableString(row, "membership_type"),
    status: readString(row, "status"),
    accountStatus: readString(row, "account_status"),
    profileStage: readString(row, "profile_stage"),
    onboardingStep: readInteger(row, "onboarding_step", 0, 4),
    lastProfileSavedAt: readNullableString(row, "last_profile_saved_at"),
    submittedAt: readNullableString(row, "submitted_at"),
    fullName: identity ? readNullableString(identity, "full_name") : null,
    hasIdentity: identity !== null,
  }
}

/**
 * Suspended/closed rows are intentionally hidden by the self-read RLS policy,
 * including from a still-valid older JWT. The SECURITY DEFINER ensure RPC can
 * safely return that user's own lifecycle envelope, so blocked routing must
 * use it without attempting a direct members SELECT. Active users still get a
 * canonical re-read for complete profile state.
 */
export async function resolveMemberRouteSnapshot(
  client: unknown,
  ensured: MemberMasterRecord
): Promise<CanonicalMemberSnapshot> {
  if (ensured.accountStatus !== "active" || ensured.status === "inactive") {
    return {
      memberId: ensured.memberId,
      memberNumber: null,
      membershipType: null,
      status: ensured.status,
      accountStatus: ensured.accountStatus,
      profileStage: ensured.profileStage,
      onboardingStep: ensured.onboardingStep,
      lastProfileSavedAt: ensured.lastProfileSavedAt,
      submittedAt: ensured.submittedAt,
      fullName: null,
      hasIdentity: false,
    }
  }

  const snapshot = await fetchCanonicalMemberSnapshot(client, ensured.memberId)
  if (!snapshot) throw new MemberMasterRpcError("read")
  return snapshot
}

export function toMemberMasterActionError(
  error: unknown,
  fallback: "saveFailed" | "submitFailed"
): MemberMasterActionError {
  if (!(error instanceof MemberMasterRpcError)) return fallback

  switch (error.machineCode) {
    case "MEMBER_MASTER_ACCOUNT_BLOCKED":
      return "accountBlocked"
    case "MEMBER_MASTER_STEP_INVALID":
      return "invalidStep"
    case "MEMBER_MASTER_STEP_OUT_OF_ORDER":
      return "stepOutOfOrder"
    case "MEMBER_MASTER_PAYLOAD_INVALID":
      return "invalidPayload"
    case "MEMBER_MASTER_REQUIRED_FIELDS_MISSING":
      return "requiredFieldsMissing"
    case "MEMBER_MASTER_NICKNAME_CONFLICT":
      return "nicknameConflict"
    case "MEMBER_MASTER_ONBOARDING_LOCKED":
      return "onboardingLocked"
    default:
      return fallback
  }
}

export function getMemberMasterDiagnostic(error: unknown) {
  if (!(error instanceof MemberMasterRpcError)) return "UNKNOWN"
  return [error.operation, error.databaseCode, error.machineCode].filter(Boolean).join(":")
}

async function invokeRpc(
  client: unknown,
  operation: MemberMasterOperation,
  name: string,
  args: Record<string, unknown> = {}
) {
  const rpcClient = client as MemberMasterRpcClient
  const { data, error } = await rpcClient.rpc(name, args)
  if (error) throw new MemberMasterRpcError(operation, error)
  if (!isRecord(data)) throw new MemberMasterRpcError(operation)
  return data
}

function parseMemberMasterRecord(data: Record<string, unknown>, operation: MemberMasterOperation) {
  try {
    return {
      memberId: readUuid(data, "member_id"),
      created: typeof data.created === "boolean" ? data.created : null,
      status: readString(data, "status"),
      accountStatus: readString(data, "account_status"),
      profileStage: readString(data, "profile_stage"),
      recordSource: readNullableString(data, "record_source"),
      onboardingStep: readInteger(data, "onboarding_step", 0, 4),
      lastProfileSavedAt: readNullableString(data, "last_profile_saved_at"),
      submittedAt: readNullableString(data, "submitted_at"),
    }
  } catch {
    throw new MemberMasterRpcError(operation)
  }
}

function getSingleIdentity(value: unknown): MemberIdentityResult | null {
  if (value === null || value === undefined) return null
  const candidate = Array.isArray(value) ? value[0] : value
  return isRecord(candidate) ? candidate : null
}

function readUuid(record: Record<string, unknown>, key: string) {
  const value = readString(record, key)
  if (!UUID_PATTERN.test(value)) throw new Error(`Invalid ${key}`)
  return value
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid ${key}`)
  return value
}

function readNullableString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (value === null || value === undefined) return null
  if (typeof value !== "string") throw new Error(`Invalid ${key}`)
  return value
}

function readInteger(record: Record<string, unknown>, key: string, min: number, max: number) {
  const value = record[key]
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new Error(`Invalid ${key}`)
  }
  return Number(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
