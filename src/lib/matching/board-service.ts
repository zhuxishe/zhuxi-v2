import { createHash } from "node:crypto"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import { validateUuids } from "@/lib/sanitize"
import { prepareMatchingRunInput } from "./run-input"
import { assertBoardDraft, BoardValidationError, createBoardDraft, evaluateBoard, previewBoardMultiMove, previewBoardPair, rematchBoardDraft, type BoardContext } from "./board-engine"
import type { BoardActionResult, BoardDisplayRow, BoardDraft, BoardRequest, BoardSnapshot, BoardSourceRow, BoardOperationSummary, BoardSubmissionPreference, BoardMemberLockRequest, BoardMemberLockOperationSummary } from "./board-types"

type RpcError = { code?: string; message: string }
type RpcClient = { rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{ data: T | null; error: RpcError | null }> }
interface Capture {
  base_revision: string
  capture: unknown
  results: BoardSourceRow[]
  layout: Pick<BoardDraft, "waitingDuoIds" | "brokenPairs"> | null
  cohort_member_ids: string[]
  round_id?: string
  session_status?: string
  results_ready?: boolean
  operations?: BoardOperationSummary[]
  locked_member_ids?: string[]
  member_lock_operations?: BoardMemberLockOperationSummary[]
}
interface MemberLockReceipt { session_id: string; operation_id: string; member_id: string; locked: boolean; expected_revision: string; base_revision: string; already_applied: boolean }
interface Receipt { session_id: string; operation_id: string; request_hash: string; base_revision: string; result_ids: string[]; already_applied: boolean }

function errorMessage(error: unknown) {
  if (error instanceof BoardValidationError) return error.message
  const message = typeof error === "object" && error && "message" in error ? String(error.message) : ""
  if (/STALE|CHANGED|REVISION/.test(message)) return "方案或人员资料已变化，本次未保存。请刷新后重新调整。"
  if (/LOCKED/.test(message)) return "已锁定的匹配不能调整，请先解锁并刷新。"
  if (/DRAFT|PUBLISHED|SESSION_STATUS/.test(message)) return "当前方案不能编辑，请先撤回已发布方案或等待匹配完成。"
  if (/BUSY|RUNNING|LEASE/.test(message)) return "当前方案正在执行其他操作，请稍后刷新重试。"
  if (/REQUEST_CONFLICT|OPERATION_CONFLICT/.test(message)) return "此操作编号已用于其他调整，请保留原请求并核对保存结果。"
  if (/INELIGIBLE|ELIGIBILITY/.test(message)) return "部分成员当前不符合匹配资格，请刷新核对。"
  if (/COHORT|PARTITION|MEMBER|OUTPUT|INPUT|LAYOUT|CONSTRAINT|MULTI|TIME|SLOT/.test(message)) return "调整内容未通过人员、共同时间或匹配约束检查，请刷新核对。"
  if (/ADMIN|PERMISSION|FORBIDDEN/.test(message)) return "没有权限执行本次调整。"
  return "暂时无法处理本次调整，请稍后重试。"
}
const rpcClient = () => createAdminClient() as unknown as RpcClient
function validateRequest(input: BoardRequest) {
  validateUuids([input.sessionId])
  if (typeof input.expectedRevision !== "string" || !input.expectedRevision.length || input.expectedRevision.length > 1000) throw new BoardValidationError("缺少方案版本，请刷新后重试")
  assertBoardDraft(input.draft)
  validateUuids([...input.draft.duos.flatMap((duo) => duo.memberIds), ...(input.draft.multi?.memberIds ?? []), ...input.draft.waitingDuoIds, ...input.draft.unmatchedIds])
}
async function captureBoard(db: RpcClient, sessionId: string, actorId: string, expectedRevision?: string) {
  const { data, error } = await db.rpc<Capture>("admin_get_matching_board", { p_session_id: sessionId, p_actor_admin_id: actorId })
  if (error) throw error
  if (!data || typeof data.base_revision !== "string" || !Array.isArray(data.results) || !Array.isArray(data.cohort_member_ids)) throw new BoardValidationError("无法读取完整人员名单，请刷新后重试")
  if (expectedRevision !== undefined && data.base_revision !== expectedRevision) throw new BoardValidationError("方案或人员资料已变化，本次未保存。请刷新后重新调整。")
  return data
}
function requireEditable(data: Capture) {
  if (data.session_status !== "draft" || data.results_ready === false) throw new BoardValidationError("当前方案不能编辑，请先撤回已发布方案或等待匹配完成。")
}
function contextFor(data: Capture): BoardContext {
  return { engine: prepareMatchingRunInput(data.capture).engineInput, originalRows: data.results, cohortMemberIds: data.cohort_member_ids,
    lockedMemberIds: data.locked_member_ids ?? [], originalLayout: data.layout }
}
/** Explicit whitelist prevents SQL source columns, engine relations, peer reviews and reasons leaking to clients. */
export function redactBoardRows(rows: BoardDisplayRow[], canViewRaw: boolean): BoardDisplayRow[] {
  return rows.map((row) => ({ key: row.key, ...(row.resultId ? { resultId: row.resultId } : {}), ...(row.status ? { status: row.status } : {}),
    member_a_id: row.member_a_id, member_b_id: row.member_b_id, group_members: row.group_members ? [...row.group_members] : null,
    total_score: row.total_score, score_breakdown: canViewRaw ? row.score_breakdown : null, rank: row.rank,
    best_slot: row.best_slot, game_type: canViewRaw && row.game_type ? row.game_type : row.group_members?.length ? "多人" : "双人" }))
}
function safeResult(result: { draft: BoardDraft; rows: BoardDisplayRow[]; passed?: boolean; reasons?: string[] }, revision: string, canViewRaw: boolean): BoardActionResult {
  return { success: true, draft: result.draft, rows: redactBoardRows(result.rows, canViewRaw), revisionToken: revision,
    ...(result.passed !== undefined ? { passed: result.passed } : {}),
    ...(result.reasons ? { reasons: canViewRaw || !result.reasons.length ? result.reasons : ["不满足共同时间或匹配约束，已保留在未匹配池。"] } : {}) }
}

function currentSubmissionPreferences(capture: unknown, cohortMemberIds: string[]): Record<string, BoardSubmissionPreference> {
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
  if (!object(capture) || !object(capture.source) || !Array.isArray(capture.source.submissions)) return {}
  const allowed = new Set(cohortMemberIds), prefs: Record<string, BoardSubmissionPreference> = {}
  for (const row of capture.source.submissions) {
    if (!object(row) || typeof row.member_id !== "string" || !allowed.has(row.member_id)) continue
    const selected: BoardSubmissionPreference = {}
    if (typeof row.game_type_pref === "string") selected.game_type_pref = row.game_type_pref
    if (typeof row.gender_pref === "string") selected.gender_pref = row.gender_pref
    if (typeof row.social_style === "string" || row.social_style === null) selected.social_style = row.social_style
    if (Array.isArray(row.interest_tags) && row.interest_tags.every((tag) => typeof tag === "string")) selected.interest_tags = [...row.interest_tags]
    if (object(row.availability)) {
      selected.availability = Object.fromEntries(Object.entries(row.availability)
        .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((slot) => typeof slot === "string"))
        .map(([date, slots]) => [date, [...slots]]))
    }
    prefs[row.member_id] = selected
  }
  return prefs
}

export async function fetchMatchingBoard(sessionId: string): Promise<BoardSnapshot> {
  validateUuids([sessionId])
  const admin = await requireAdmin(), data = await captureBoard(rpcClient(), sessionId, admin.id)
  const draft = createBoardDraft(data.results, data.cohort_member_ids, data.layout)
  // Loading is read-only and must remain possible when an existing member becomes ineligible.
  const rows = data.results.filter((row) => row.status !== "cancelled").map((row) => ({ ...row, key: row.id, resultId: row.id }))
  return { draft, revisionToken: data.base_revision, rows: redactBoardRows(rows, admin.role === "super_admin"),
    lockedResultIds: data.results.filter((row) => row.status === "locked").map((row) => row.id),
    lockedMemberIds: (data.locked_member_ids ?? []).filter((id) => data.cohort_member_ids.includes(id)),
    memberLockOperations: (data.member_lock_operations ?? []).map((operation) => ({ id: operation.id, created_at: operation.created_at, locked: operation.locked })),
    cohortMemberIds: data.cohort_member_ids, canViewRaw: admin.role === "super_admin",
    ...(admin.role === "super_admin" ? { currentSubmissionPrefs: currentSubmissionPreferences(data.capture, data.cohort_member_ids) } : {}),
    operations: (data.operations ?? []).map((operation) => ({ id: operation.id, created_at: operation.created_at, member_count: operation.member_count, result_count: operation.result_count })) }
}

async function preview(input: BoardRequest, operation: (context: BoardContext) => { draft: BoardDraft; rows: BoardDisplayRow[]; passed?: boolean; reasons?: string[] }): Promise<BoardActionResult> {
  const admin = await requireAdmin()
  try {
    validateRequest(input)
    const data = await captureBoard(rpcClient(), input.sessionId, admin.id, input.expectedRevision)
    requireEditable(data)
    return safeResult(operation(contextFor(data)), data.base_revision, admin.role === "super_admin")
  } catch (error) {
    // Detailed constraint failures may expose private blacklist/feedback history.
    const message = errorMessage(error)
    return { error: admin.role !== "super_admin" && error instanceof BoardValidationError && /黑名单|冷却|禁忌/.test(message) ? "当前调整不满足匹配约束，请选择其他成员。" : message }
  }
}
export async function inspectMatchingBoardPair(input: BoardRequest & { memberIds: [string, string] }): Promise<BoardActionResult> {
  return preview(input, (context) => {
    if (!Array.isArray(input.memberIds) || input.memberIds.length !== 2) throw new BoardValidationError("请选择两名成员")
    validateUuids(input.memberIds)
    return previewBoardPair(context, input.draft, input.memberIds)
  })
}
export async function inspectMatchingBoardMultiMove(input: BoardRequest & { memberId: string }): Promise<BoardActionResult> {
  return preview(input, (context) => {
    validateUuids([input.memberId])
    return previewBoardMultiMove(context, input.draft, input.memberId)
  })
}
export async function rematchMatchingBoard(input: BoardRequest): Promise<BoardActionResult> {
  return preview(input, (context) => rematchBoardDraft(context, input.draft))
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") return `{${Object.keys(value).sort().filter((key) => (value as Record<string, unknown>)[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`
  return JSON.stringify(value)
}
export function boardRequestHash(input: BoardRequest, reason: string) {
  return createHash("sha256").update(canonical({ sessionId: input.sessionId, draft: input.draft, expectedRevision: input.expectedRevision, reason })).digest("hex")
}
async function receipt(db: RpcClient, operationId: string, actorId: string): Promise<Receipt | null> {
  const result = await db.rpc<Receipt>("admin_get_matching_board_operation", { p_operation_id: operationId, p_actor_admin_id: actorId })
  if (result.error) throw result.error
  return result.data
}
function confirmed(result: Receipt, input: BoardRequest & { operationId: string }, hash: string): BoardActionResult {
  if (result.session_id !== input.sessionId || result.operation_id !== input.operationId || result.request_hash !== hash) return { error: "此操作编号已用于其他调整，请保留原请求并核对保存结果。", operationId: input.operationId }
  revalidatePath(`/admin/matching/${input.sessionId}`)
  revalidatePath("/admin/matching", "layout")
  return { success: true, operationId: input.operationId, revisionToken: result.base_revision }
}
function definiteRejection(error: unknown) {
  const value = error as RpcError | null
  return !!value && (/^MATCH_(BOARD|PUBLICATION|RUN)_/.test(value.message ?? "") || ["22023", "42501", "22P02", "PT409", "23505", "23503"].includes(value.code ?? ""))
}

export async function saveMatchingBoard(input: BoardRequest & { operationId: string; reason: string }): Promise<BoardActionResult> {
  const admin = await requireAdmin(), reason = normalizeAdminAuditReason(input.reason)
  if (!reason.ok) return { error: reason.error }
  try { validateRequest(input); validateUuids([input.operationId]) } catch { return { error: "调整内容或操作编号无效，请刷新后重试。" } }
  const db = rpcClient(), hash = boardRequestHash(input, reason.reason)
  // Successful retries resolve before recapture: the prior commit has already changed the revision.
  try {
    const previous = await receipt(db, input.operationId, admin.id)
    if (previous) return confirmed(previous, input, hash)
  } catch { return { error: "暂时无法确认原保存结果，请保留当前调整并使用原操作编号重试。", operationId: input.operationId, unknown: true } }
  let data: Capture, evaluation: ReturnType<typeof evaluateBoard>, context: BoardContext
  try {
    data = await captureBoard(db, input.sessionId, admin.id, input.expectedRevision)
    requireEditable(data)
    context = contextFor(data)
    evaluation = evaluateBoard(context, input.draft, true)
  } catch (error) {
    const message = errorMessage(error)
    return { error: admin.role !== "super_admin" && /黑名单|冷却|禁忌/.test(message) ? "当前调整不满足匹配约束，请选择其他成员。" : message, operationId: input.operationId }
  }
  try {
    const result = await db.rpc<Receipt>("admin_save_matching_board", {
      p_session_id: input.sessionId, p_actor_admin_id: admin.id, p_operation_id: input.operationId, p_reason: reason.reason,
      p_expected_revision: input.expectedRevision, p_engine: context.engine, p_keep_result_ids: evaluation.keepResultIds,
      p_rows: evaluation.changedRows, p_layout: { waitingDuoIds: evaluation.draft.waitingDuoIds, brokenPairs: evaluation.draft.brokenPairs },
      p_unmatched_ids: evaluation.unmatchedIds, p_request_hash: hash,
    })
    if (result.error) throw result.error
    if (!result.data) throw new Error("SAVE_OUTCOME_UNKNOWN")
    if (data.round_id) revalidatePath(`/admin/matching/rounds/${data.round_id}`)
    return confirmed(result.data, input, hash)
  } catch (error) {
    try {
      const saved = await receipt(db, input.operationId, admin.id)
      if (saved) return confirmed(saved, input, hash)
    } catch { /* Missing response never establishes a failed transaction. */ }
    if (definiteRejection(error)) return { error: errorMessage(error), operationId: input.operationId }
    return { error: "保存结果暂时无法确认。请保留当前调整并使用原操作编号重试，避免重复保存。", operationId: input.operationId, unknown: true }
  }
}


async function memberLockReceipt(db: RpcClient, operationId: string, actorId: string): Promise<MemberLockReceipt | null> {
  const result = await db.rpc<MemberLockReceipt>("admin_get_matching_board_member_lock_operation", { p_operation_id: operationId, p_actor_admin_id: actorId })
  if (result.error) throw result.error
  return result.data
}
function confirmedMemberLock(result: MemberLockReceipt, input: BoardMemberLockRequest): BoardActionResult {
  if (result.session_id !== input.sessionId || result.operation_id !== input.operationId || result.member_id !== input.memberId
      || result.locked !== input.locked || result.expected_revision !== input.expectedRevision) {
    return { error: "此操作编号已用于其他调整，请保留原请求并核对锁定结果。", operationId: input.operationId }
  }
  revalidatePath(`/admin/matching/${input.sessionId}`)
  revalidatePath("/admin/matching", "layout")
  return { success: true, operationId: input.operationId, revisionToken: result.base_revision }
}

/** Set a target state, not a toggle: identical retries must never reverse a successful lock. */
export async function setMatchingBoardMemberLock(input: BoardMemberLockRequest): Promise<BoardActionResult> {
  const admin = await requireAdmin()
  try {
    validateUuids([input.sessionId, input.memberId, input.operationId])
    if (typeof input.locked !== "boolean" || typeof input.expectedRevision !== "string" || !input.expectedRevision.length || input.expectedRevision.length > 1000) throw new Error("INVALID_MEMBER_LOCK_REQUEST")
  } catch { return { error: "锁定内容或操作编号无效，请刷新后重试。" } }
  const db = rpcClient()
  // A committed response may be lost; resolve the original operation before checking its now-stale revision.
  try {
    const previous = await memberLockReceipt(db, input.operationId, admin.id)
    if (previous) return confirmedMemberLock(previous, input)
  } catch (error) {
    if (definiteRejection(error)) return { error: errorMessage(error), operationId: input.operationId }
    return { error: "暂时无法确认原锁定结果，请保留原操作编号重试。", operationId: input.operationId, unknown: true }
  }
  try {
    const data = await captureBoard(db, input.sessionId, admin.id, input.expectedRevision)
    requireEditable(data)
    const saved = createBoardDraft(data.results, data.cohort_member_ids, data.layout)
    if (!saved.duos.some((duo) => duo.memberIds.includes(input.memberId)) && !saved.waitingDuoIds.includes(input.memberId)) {
      throw new BoardValidationError("只有双人池中的成员可以设置个人锁定，请先保存当前调整并刷新。")
    }
  } catch (error) { return { error: errorMessage(error), operationId: input.operationId } }
  try {
    const result = await db.rpc<MemberLockReceipt>("admin_set_matching_board_member_lock", {
      p_session_id: input.sessionId, p_actor_admin_id: admin.id, p_member_id: input.memberId,
      p_locked: input.locked, p_operation_id: input.operationId, p_expected_revision: input.expectedRevision,
    })
    if (result.error) throw result.error
    if (!result.data) throw new Error("MEMBER_LOCK_OUTCOME_UNKNOWN")
    return confirmedMemberLock(result.data, input)
  } catch (error) {
    try {
      const applied = await memberLockReceipt(db, input.operationId, admin.id)
      if (applied) return confirmedMemberLock(applied, input)
    } catch { /* A lost response must keep the original operation available for retry. */ }
    if (definiteRejection(error)) return { error: errorMessage(error), operationId: input.operationId }
    return { error: "锁定结果暂时无法确认。请保留原操作编号重试，避免重复操作。", operationId: input.operationId, unknown: true }
  }
}
