import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import { validateUuids } from "@/lib/sanitize"
import { matchingPublicationError } from "./publication-errors"
import { MATCHING_ENGINE_ALGORITHM_VERSION, MATCHING_RUN_ADAPTER_VERSION, prepareMatchingRunInput, type MatchingEngineInput } from "./run-input"
import { createScoringV3Config, validateScoringPolicy } from "./scoring-policy"
import { buildManualAdjustment, inspectManualAdjustment, runPoolAdjustment } from "./adjustment-engine"
import { buildUnmatchedDiagnostics } from "./unmatched-diagnostics"
import { MATCHING_ADJUSTMENT_ERRORS, type MatchingAdjustmentKind, type MatchingAdjustmentPreview, type MatchingAdjustmentReceipt, type MatchingAdjustmentRecord, type MatchingAdjustmentResult, type MatchingAdjustmentSummary } from "./adjustment-types"

type RpcError = { code?: string; message: string }
type RpcClient = { rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{ data: T | null; error: RpcError | null }> }
interface ServerPreview {
  capture: unknown
  selected_member_ids: string[]
  has_existing_multi_pool: boolean
  base_revision: string
  summary: MatchingAdjustmentSummary
  available_members: { id: string; name: string }[]
  excluded_members: { id: string; reasons: string[] }[]
  result_snapshot?: { best_slot?: string | null } | null
}

function invalidate(sessionId: string, roundId?: string) {
  revalidatePath(`/admin/matching/${sessionId}`)
  if (roundId) revalidatePath(`/admin/matching/rounds/${roundId}`)
}

const GROUPED_BOARD_ERROR = "此方案已启用多人分组，请返回三池子页面调整并统一保存。"

function message(error: RpcError | null, fallback: string) {
  const value = error?.message ?? ""
  if (/^MATCH_ADJUSTMENT_BOARD_GROUPED(?::|$)/.test(value)) return GROUPED_BOARD_ERROR
  if (/CANDIDATES_INSUFFICIENT/.test(value)) return MATCHING_ADJUSTMENT_ERRORS.CANDIDATES_INSUFFICIENT
  if (/REQUIRES_DRAFT/.test(value)) return "当前方案尚未完整生成或已经发布，请刷新；已发布方案须先撤回后调整。"
  if (/NOT_RECOVERABLE/.test(value)) return "本编号不能继续恢复，请核对调整记录，重新检查后再明确新增操作。"
  if (/SESSION_UNAVAILABLE|NOT_FOUND/.test(value)) return "该方案或调整不存在、已删除或不可用，请刷新核对。"
  if (/REQUEST_CONFLICT/.test(value)) return "此操作编号已用于其他调整，请核对操作记录。"
  if (/INPUT_INVALID|ENGINE_INVALID|SOURCE_UNAVAILABLE|SNAPSHOT_UNAVAILABLE/.test(value)) return MATCHING_ADJUSTMENT_ERRORS.INPUT_INVALID
  if (/STALE|CHANGED/.test(value)) return MATCHING_ADJUSTMENT_ERRORS.ADJUSTMENT_CHANGED
  if (/OCCUPIED|CONFLICT/.test(value)) return "所选成员已在当前方案的其他有效结果中，请刷新并先拆分冲突结果。"
  if (/MULTI_POOL/.test(value)) return "当前方案已有有效多人池；请明确拆分原池后重新组建，不能追加第二个多人池。"
  if (/ELIGIBILITY|INELIGIBLE/.test(value)) return "所选成员当前不符合匹配资格，请刷新查看排除原因。"
  if (/ORIGINAL_TIME/.test(value)) return MATCHING_ADJUSTMENT_ERRORS.ORIGINAL_TIME_UNAVAILABLE
  if (/PRIVACY|REDACTED/.test(value)) return MATCHING_ADJUSTMENT_ERRORS.PRIVACY_REDACTED
  if (/OWNER|ADMIN/.test(value)) return "只有发起本次调整的管理员可以恢复该操作。"
  if (/BUSY|LEASE/.test(value)) return "当前方案正在处理其他操作，请查看操作记录；超时后恢复原编号。"
  if (/CONSTRAINT/.test(value)) return MATCHING_ADJUSTMENT_ERRORS.CONSTRAINTS_FAILED
  return matchingPublicationError(error, fallback)
}

function definiteRejection(error: RpcError | null): boolean {
  return !!error && (/^(MATCH_ADJUSTMENT_|MATCH_PUBLICATION_|MATCH_RUN_SERVER_ADMIN_REQUIRED)/.test(error.message)
    || ["22023", "42501", "22P02", "PT409", "23505", "23503"].includes(error.code ?? ""))
}

function sameOperation(receipt: MatchingAdjustmentReceipt, input: ExecuteInput, actorId: string) {
  const record = receipt.operation
  return record.actor_admin_id === actorId && record.session_id === input.sessionId && record.kind === input.kind
    && (record.result_id ?? null) === (input.resultId ?? null)
    && JSON.stringify([...record.member_ids].sort()) === JSON.stringify([...(input.memberIds ?? [])].sort())
}

function terminal(receipt: MatchingAdjustmentReceipt): MatchingAdjustmentResult | null {
  return receipt.operation.status === "succeeded"
    ? { success: true, operationId: receipt.operation.id, status: "succeeded" } : null
}

async function readReceipt(db: RpcClient, operationId: string, actorId: string): Promise<MatchingAdjustmentReceipt | null> {
  try {
    const { data, error } = await db.rpc<MatchingAdjustmentReceipt>("admin_get_matching_adjustment", { p_operation_id: operationId, p_actor_admin_id: actorId })
    return !error && data?.operation ? data : null
  } catch { return null }
}

function restoreEngine(value: MatchingEngineInput): MatchingEngineInput {
  if (value.algorithm_version !== MATCHING_ENGINE_ALGORITHM_VERSION || value.adapter_version !== MATCHING_RUN_ADAPTER_VERSION) throw new Error("VERSION_UNSUPPORTED")
  if (!Array.isArray(value.candidates) || !Array.isArray(value.idMap) || !Array.isArray(value.pairRelations) || !value.config) throw new Error("INPUT_INVALID")
  validateScoringPolicy(value.config.scoringPolicy)
  const expected = createScoringV3Config(value.config.scoringPolicy)
  if (Object.keys(expected.weights).some((key) => value.config.weights[key as keyof typeof expected.weights] !== expected.weights[key as keyof typeof expected.weights])) throw new Error("INPUT_INVALID")
  return structuredClone(value)
}

async function fail(db: RpcClient, receipt: MatchingAdjustmentReceipt, actorId: string, code: string): Promise<MatchingAdjustmentResult> {
  const known = await readReceipt(db, receipt.operation.id, actorId)
  const saved = known && terminal(known)
  if (saved) return saved
  try {
    const { data, error } = await db.rpc<MatchingAdjustmentReceipt>("admin_fail_matching_adjustment", {
      p_operation_id: receipt.operation.id, p_actor_admin_id: actorId, p_lease_token: receipt.lease_token, p_error_code: code,
    })
    if (!error && data?.operation) return terminal(data) ?? {
      error: MATCHING_ADJUSTMENT_ERRORS[data.operation.error_code ?? code] ?? MATCHING_ADJUSTMENT_ERRORS.UNKNOWN,
      operationId: data.operation.id, status: data.operation.status,
    }
  } catch { /* A lost response is not evidence that a transaction failed. */ }
  const after = await readReceipt(db, receipt.operation.id, actorId)
  return after && terminal(after) || { error: MATCHING_ADJUSTMENT_ERRORS.UNKNOWN, operationId: receipt.operation.id, status: after?.operation.status ?? "running", busy: true }
}

async function preview(sessionId: string, actorId: string, kind: MatchingAdjustmentKind, memberIds: string[], resultId: string | null) {
  const db = createAdminClient() as unknown as RpcClient
  const { data, error } = await db.rpc<ServerPreview>("admin_preview_matching_adjustment", {
    p_session_id: sessionId, p_actor_admin_id: actorId, p_kind: kind, p_member_ids: memberIds, p_result_id: resultId,
  })
  if (error || !data || typeof data.base_revision !== "string" || !data.summary || !Array.isArray(data.available_members) || !Array.isArray(data.excluded_members)) {
    throw new Error(message(error, "暂时无法检查本次匹配资格，请刷新后重试。"))
  }
  return data
}

export async function fetchMatchingAdjustmentPreview(sessionId: string, kind: "manual" | "pool" = "manual"): Promise<MatchingAdjustmentPreview> {
  validateUuids([sessionId])
  const admin = await requireAdmin()
  const data = await preview(sessionId, admin.id, kind, [], null)
  return { ...data.summary, base_revision: data.base_revision, has_existing_multi_pool: data.has_existing_multi_pool,
    available_members: data.available_members, excluded_members: data.excluded_members }
}

export async function inspectMatchingAdjustment(sessionId: string, memberIds: string[]) {
  validateUuids([sessionId, ...memberIds])
  const admin = await requireAdmin()
  const data = await preview(sessionId, admin.id, "manual", memberIds, null)
  const engine = prepareMatchingRunInput(data.capture).engineInput
  const inspection = inspectManualAdjustment(engine, memberIds)
  if (memberIds.length > 2 && data.has_existing_multi_pool) {
    inspection.passed = false
    inspection.reasons.push("当前方案已有有效多人池；请先明确拆分原池后重新组建")
    inspection.rows = []
  }
  const canViewRaw = admin.role === "super_admin"
  if (!canViewRaw) {
    inspection.reasons = inspection.passed ? [] : ["存在不满足的匹配约束"]
    inspection.rows = inspection.rows.map((row) => ({ ...row, score_breakdown: null,
      game_type: row.group_members?.length ? "多人" : "双人" }))
  }
  return { inspection, revisionToken: data.base_revision, canViewRaw }
}

export async function fetchMatchingAdjustmentRecords(sessionId: string): Promise<MatchingAdjustmentRecord[]> {
  validateUuids([sessionId])
  const admin = await requireAdmin()
  const db = createAdminClient() as unknown as RpcClient
  const { data, error } = await db.rpc<MatchingAdjustmentRecord[]>("admin_list_matching_adjustments", { p_session_id: sessionId, p_actor_admin_id: admin.id })
  if (error || !Array.isArray(data)) throw new Error("暂时无法读取调整记录，请刷新后重试。")
  // Raw reasons, actors and member selections do not need to be sent to ordinary admins.
  return data.map((row) => ({
    id: row.id, session_id: row.session_id, round_id: row.round_id, kind: row.kind, status: row.status,
    attempt: row.attempt, created_at: row.created_at, updated_at: row.updated_at, captured_at: row.captured_at,
    submitted_count: row.submitted_count, eligible_count: row.eligible_count, excluded_count: row.excluded_count,
    exclusion_summary: row.exclusion_summary, has_existing_multi_pool: row.has_existing_multi_pool,
    error_code: row.error_code, can_recover: row.can_recover, base_revision: row.base_revision,
    actor_admin_id: admin.role === "super_admin" ? row.actor_admin_id : "",
    result_id: row.result_id, member_ids: admin.role === "super_admin" ? row.member_ids : [],
  }))
}

interface ExecuteInput { sessionId: string; kind: MatchingAdjustmentKind; memberIds?: string[]; resultId?: string | null; reason: string; operationId: string; expectedRevision?: string }

async function execute(input: ExecuteInput, actorId: string): Promise<MatchingAdjustmentResult> {
  const db = createAdminClient() as unknown as RpcClient
  let receipt: MatchingAdjustmentReceipt
  try {
    const { data, error } = await db.rpc<MatchingAdjustmentReceipt>("admin_begin_matching_adjustment", {
      p_session_id: input.sessionId, p_actor_admin_id: actorId, p_kind: input.kind,
      p_member_ids: input.memberIds ?? [], p_result_id: input.resultId ?? null,
      p_operation_id: input.operationId, p_reason: input.reason, p_expected_revision: input.expectedRevision ?? null,
    })
    if (error || !data?.operation) {
      const known = await readReceipt(db, input.operationId, actorId)
      if (known && !sameOperation(known, input, actorId)) return { error: "此操作编号已用于其他调整，请核对操作记录。", operationId: input.operationId }
      return known && terminal(known) || { error: message(error, MATCHING_ADJUSTMENT_ERRORS.UNKNOWN), operationId: input.operationId, status: known?.operation.status, busy: known?.operation.status === "running" || !definiteRejection(error) }
    }
    receipt = data
  } catch {
    const known = await readReceipt(db, input.operationId, actorId)
    if (known && !sameOperation(known, input, actorId)) return { error: "此操作编号已用于其他方案，请核对操作记录。", operationId: input.operationId }
    return known && terminal(known) || { error: MATCHING_ADJUSTMENT_ERRORS.UNKNOWN, operationId: input.operationId, status: known?.operation.status, busy: true }
  }
  if (!sameOperation(receipt, input, actorId)) return { error: "调整回执与当前操作不一致，请刷新核对。", operationId: input.operationId }
  const saved = terminal(receipt)
  if (saved) { invalidate(input.sessionId, receipt.operation.round_id); return saved }
  if (!receipt.acquired || !receipt.lease_token) return { error: receipt.operation.status === "failed" ? MATCHING_ADJUSTMENT_ERRORS[receipt.operation.error_code ?? "UNKNOWN"] ?? MATCHING_ADJUSTMENT_ERRORS.UNKNOWN : "本次调整正在处理，请保留原编号并刷新操作记录。", operationId: input.operationId, status: receipt.operation.status, busy: receipt.operation.status === "running" }
  let code = "INPUT_INVALID"
  let groupedBoardRefusal = false
  try {
    let rows: ReturnType<typeof buildManualAdjustment> = [], unmatchedIds: string[] = [], diagnostics: ReturnType<typeof buildUnmatchedDiagnostics> = []
    if (input.kind !== "split") {
      if (!receipt.engine_input && !receipt.capture) throw new Error("INPUT_INVALID")
      const engine = restoreEngine(receipt.engine_input ?? prepareMatchingRunInput(receipt.capture).engineInput)
      if (engine.candidates.length < 2) throw new Error("CANDIDATES_INSUFFICIENT")
      code = "STAGE_FAILED"
      if (!receipt.engine_input) {
        const { error } = await db.rpc("admin_stage_matching_adjustment", { p_operation_id: input.operationId, p_actor_admin_id: actorId, p_lease_token: receipt.lease_token, p_engine: engine })
        if (error) throw new Error(code)
      }
      code = "ENGINE_FAILED"
      if (input.kind === "pool") {
        const result = runPoolAdjustment(engine, receipt.has_existing_multi_pool ?? receipt.operation.has_existing_multi_pool)
        rows = result.rows
        const ids = new Map(engine.idMap)
        unmatchedIds = result.unmatchedIds.map((id) => ids.get(id) ?? id)
        diagnostics = buildUnmatchedDiagnostics(engine, result.unmatchedIds)
      } else {
        const selected = receipt.selected_member_ids ?? input.memberIds ?? []
        if (selected.length > 2 && (receipt.has_existing_multi_pool ?? receipt.operation.has_existing_multi_pool)) throw new Error("CONSTRAINTS_FAILED")
        rows = buildManualAdjustment(engine, selected)
        if (input.kind === "restore") {
          const oldSlot = receipt.result_snapshot?.best_slot?.replace(/ /g, "_")
          if (!oldSlot || !engine.candidates.every((candidate) => Object.entries(candidate.availability).some(([date, slots]) => slots.some((slot) => `${date}_${slot}` === oldSlot)))) throw new Error("ORIGINAL_TIME_UNAVAILABLE")
        }
      }
    }
    code = "SAVE_FAILED"
    const { data, error } = await db.rpc<MatchingAdjustmentReceipt>("admin_complete_matching_adjustment", {
      p_operation_id: input.operationId, p_actor_admin_id: actorId, p_lease_token: receipt.lease_token,
      p_rows: rows, p_unmatched_ids: unmatchedIds, p_diagnostics: diagnostics,
    })
    if (error || !data?.operation || !terminal(data)) {
      const detail = error?.message ?? ""
      if (/^MATCH_ADJUSTMENT_BOARD_GROUPED(?::|$)/.test(detail)) { code = "ADJUSTMENT_CHANGED"; groupedBoardRefusal = true }
      if (/STALE|CHANGED/.test(detail) && !/LEASE/.test(detail)) code = "ADJUSTMENT_CHANGED"
      if (/MEMBER_INELIGIBLE/.test(detail)) code = "MEMBER_INELIGIBLE"
      if (/MEMBER_OCCUPIED/.test(detail)) code = "MEMBER_OCCUPIED"
      if (/CONSTRAINT|SECOND_MULTI_POOL/.test(detail)) code = "CONSTRAINTS_FAILED"
      if (/ORIGINAL_TIME/.test(detail)) code = "ORIGINAL_TIME_UNAVAILABLE"
      if (/ENGINE_INVALID|OUTPUT_INVALID|COHORT_MISMATCH|DIAGNOSTICS_INVALID/.test(detail)) code = "INPUT_INVALID"
      if (/PRIVACY|REDACTED/.test(detail)) code = "PRIVACY_REDACTED"
      throw new Error(code)
    }
    invalidate(input.sessionId, data.operation.round_id)
    return { ...terminal(data)!, matchCount: rows.length }
  } catch (error) {
    if (error instanceof Error && Object.hasOwn(MATCHING_ADJUSTMENT_ERRORS, error.message)) code = error.message
    if (error instanceof Error && "code" in error && error.code === "MATCHING_ADJUSTMENT_CONSTRAINT") code = "CONSTRAINTS_FAILED"
    const result = await fail(db, receipt, actorId, code)
    invalidate(input.sessionId, receipt.operation.round_id)
    return groupedBoardRefusal && result.status === "failed" && !result.success ? { ...result, error: GROUPED_BOARD_ERROR } : result
  }
}

export async function performMatchingAdjustment(input: Omit<ExecuteInput, "reason" | "operationId"> & { rawReason: string; operationId?: string }): Promise<MatchingAdjustmentResult> {
  const admin = await requireAdmin()
  const reason = normalizeAdminAuditReason(input.rawReason)
  if (!reason.ok) return { error: reason.error }
  if (!input.operationId) return { error: "缺少操作编号，请刷新后重试。" }
  try { validateUuids([input.sessionId, input.operationId, ...(input.memberIds ?? []), ...(input.resultId ? [input.resultId] : [])]) } catch { return { error: "操作编号或成员编号无效，请刷新后重试。" } }
  if (input.kind === "manual" && (input.memberIds?.length ?? 0) < 2) return { error: "至少需要 2 人" }
  if (input.memberIds && new Set(input.memberIds).size !== input.memberIds.length) return { error: "不能重复选择同一名成员" }
  return execute({ ...input, reason: reason.reason, operationId: input.operationId }, admin.id)
}

export async function recoverMatchingAdjustmentOperation(sessionId: string, operationId: string, rawReason: string): Promise<MatchingAdjustmentResult> {
  const admin = await requireAdmin()
  const reason = normalizeAdminAuditReason(rawReason)
  if (!reason.ok) return { error: reason.error }
  try { validateUuids([sessionId, operationId]) } catch { return { error: "操作编号无效，请刷新后重试。" } }
  const receipt = await readReceipt(createAdminClient() as unknown as RpcClient, operationId, admin.id)
  if (!receipt || receipt.operation.session_id !== sessionId) return { error: "无法读取此方案的调整记录，请核对编号和权限。" }
  if (receipt.operation.actor_admin_id !== admin.id) return { error: "只有发起本次调整的管理员可以恢复该操作。", operationId }
  const saved = terminal(receipt)
  if (saved) return saved
  return execute({ sessionId, kind: receipt.operation.kind, memberIds: receipt.operation.member_ids, resultId: receipt.operation.result_id, reason: reason.reason, operationId }, admin.id)
}
