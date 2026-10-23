import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import { MATCHING_ENGINE_ALGORITHM_VERSION, MATCHING_RUN_ADAPTER_VERSION, prepareMatchingRunInput, type MatchingEngineInput } from "./run-input"
import { runFullMatching } from "./run-matching"
import { MATCHING_RUN_ERROR_MESSAGES, type MatchingRunRecord, type MatchingRunStatus } from "./run-lifecycle"

type RpcError = { code?: string; message: string }
type RpcClient = { rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{ data: T | null; error: RpcError | null }> }
interface Receipt {
  run: MatchingRunRecord
  acquired?: boolean
  lease_token?: string
  capture?: unknown
  engine_input?: MatchingEngineInput | null
  session_id?: string | null
  session_deleted?: boolean
}
export interface RoundRunResult {
  success?: true
  sessionId?: string
  error?: string
  runId?: string
  status?: MatchingRunStatus
  busy?: boolean
  sessionDeleted?: boolean
}
const isUuid = (id: string) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

function invalidate(roundId: string) {
  revalidatePath(`/admin/matching/rounds/${roundId}`)
  revalidatePath("/admin/matching")
  revalidatePath("/app")
  revalidatePath("/app/matching/survey")
}

function receiptResult(receipt: Receipt): RoundRunResult | null {
  const run = receipt.run
  if (run.status === "succeeded") {
    const sessionId = receipt.session_id ?? run.session_id
    if (!sessionId || receipt.session_deleted || run.session_deleted) {
      return { error: "本次运行已成功，但原方案已被删除；不会重新生成。如需计算，请新增一次运行。", runId: run.id, status: run.status, sessionDeleted: true }
    }
    return { success: true, sessionId, runId: run.id, status: run.status }
  }
  if (run.status === "abandoned") return { error: "本次运行已作废；如需计算，请新增一次运行。", runId: run.id, status: run.status }
  return null
}

function rpcMessage(error: RpcError | null, fallback: string) {
  const message = error?.message ?? ""
  if (message.includes("MATCH_RUN_ROUND_UNAVAILABLE")) return "轮次不存在、已删除或当前不允许运行，请刷新核对收集状态。"
  if (message.includes("MATCH_RUN_OWNER") || message.includes("MATCH_RUN_ADMIN")) return "只有发起本次运行的管理员可以恢复或作废。"
  if (message.includes("MATCH_RUN_LEASE") || message.includes("MATCH_RUN_BUSY")) return "本轮已有运行正在处理，请查看运行记录；超时后可恢复原运行。"
  if (message.includes("MATCH_RUN_ROUND_CHANGED") || message.includes("MATCH_PUBLICATION_STALE")) return MATCHING_RUN_ERROR_MESSAGES.ROUND_CHANGED
  if (message.includes("MATCH_RUN_SNAPSHOT_UNAVAILABLE")) return "本批原输入已不可恢复，请核对运行记录并作废后新增运行。"
  if (message.includes("PRIVACY") || message.includes("REDACTED")) return MATCHING_RUN_ERROR_MESSAGES.PRIVACY_REDACTED
  return fallback
}

async function readReceipt(db: RpcClient, runId: string, actorId: string): Promise<Receipt | null> {
  try {
    const { data, error } = await db.rpc<Receipt>("admin_get_matching_run", { p_run_id: runId, p_actor_admin_id: actorId })
    return !error && data?.run ? data : null
  } catch { return null }
}

/** Never treats a lost response as permission to delete a successfully saved plan. */
async function recordFailure(db: RpcClient, receipt: Receipt, actorId: string, code: string): Promise<RoundRunResult> {
  const known = await readReceipt(db, receipt.run.id, actorId)
  const completed = known && receiptResult(known)
  if (completed) return completed
  try {
    const { data, error } = await db.rpc<Receipt>("admin_fail_matching_run", {
      p_run_id: receipt.run.id, p_actor_admin_id: actorId, p_lease_token: receipt.lease_token, p_error_code: code,
    })
    if (!error && data?.run) {
      const terminal = receiptResult(data)
      if (terminal) return terminal
      return { error: MATCHING_RUN_ERROR_MESSAGES[data.run.error_code ?? code] ?? MATCHING_RUN_ERROR_MESSAGES.UNKNOWN, runId: data.run.id, status: data.run.status }
    }
  } catch { /* Status is unknown; keep the operation ID so its next request checks the receipt. */ }
  const after = await readReceipt(db, receipt.run.id, actorId)
  const terminal = after && receiptResult(after)
  return terminal || { error: "运行结果暂时无法确认，请保留本次编号并在运行记录中刷新或恢复；请勿重复新增运行。", runId: receipt.run.id, status: after?.run.status ?? "running", busy: true }
}

function restoreEngine(value: MatchingEngineInput): MatchingEngineInput {
  if (value.algorithm_version !== MATCHING_ENGINE_ALGORITHM_VERSION || value.adapter_version !== MATCHING_RUN_ADAPTER_VERSION) {
    throw new Error("VERSION_UNSUPPORTED")
  }
  if (!Array.isArray(value.candidates) || !Array.isArray(value.idMap) || !Array.isArray(value.pairRelations) || !value.config) throw new Error("INPUT_INVALID")
  return structuredClone(value)
}

async function executeRoundRun(roundId: string, sessionName: string, reason: string, requestId: string, actorId: string): Promise<RoundRunResult> {
  const db = createAdminClient() as unknown as RpcClient
  let receipt: Receipt
  try {
    const { data, error } = await db.rpc<Receipt>("admin_begin_matching_run", {
      p_round_id: roundId, p_request_id: requestId, p_actor_admin_id: actorId, p_session_name: sessionName, p_reason: reason,
    })
    if (error || !data?.run) {
      const known = await readReceipt(db, requestId, actorId)
      if (known && known.run.round_id !== roundId) return { error: "此运行编号已用于其他轮次，请核对运行记录。", runId: requestId }
      const terminal = known && receiptResult(known)
      return terminal || { error: rpcMessage(error, "暂时无法确认运行是否开始，请保留本次编号，在运行记录中刷新或重试。"), runId: requestId, status: known?.run.status, busy: true }
    }
    if (data.run.round_id !== roundId) return { error: "运行回执与当前轮次不一致，请刷新核对。", runId: requestId }
    receipt = data
  } catch {
    const known = await readReceipt(db, requestId, actorId)
    if (known && known.run.round_id !== roundId) return { error: "此运行编号已用于其他轮次，请核对运行记录。", runId: requestId }
    const terminal = known && receiptResult(known)
    return terminal || { error: "网络异常，运行结果待确认。请保留本次编号，在运行记录中刷新或重试。", runId: requestId, status: known?.run.status, busy: true }
  }
  const terminal = receiptResult(receipt)
  if (terminal) { invalidate(roundId); return terminal }
  if (receipt.run.status === "failed" && !receipt.acquired) {
    invalidate(roundId)
    return { error: MATCHING_RUN_ERROR_MESSAGES[receipt.run.error_code ?? "UNKNOWN"] ?? MATCHING_RUN_ERROR_MESSAGES.UNKNOWN, runId: receipt.run.id, status: "failed" }
  }
  if (!receipt.acquired || !receipt.lease_token) {
    return { error: "本轮已有运行正在处理，请查看运行记录；超时后可恢复原运行。", runId: receipt.run.id, status: receipt.run.status, busy: true }
  }

  let failureCode = "INPUT_INVALID"
  try {
    // A resumed operation uses the staged engine input, never current forms/history.
    const engine = receipt.engine_input ? restoreEngine(receipt.engine_input) : prepareMatchingRunInput(receipt.capture).engineInput
    if (engine.candidates.length < 2) {
      failureCode = "CANDIDATES_INSUFFICIENT"
      throw new Error(failureCode)
    }
    if (!receipt.engine_input) {
      failureCode = "STAGE_FAILED"
      const { error } = await db.rpc<Receipt>("admin_stage_matching_run", {
        p_run_id: receipt.run.id, p_actor_admin_id: actorId, p_lease_token: receipt.lease_token, p_engine_input: engine,
      })
      if (error) throw new Error(failureCode)
    }
    failureCode = "ENGINE_FAILED"
    const idMap = new Map(engine.idMap)
    const result = runFullMatching(engine.candidates, engine.config, idMap, new Map(engine.pairRelations))
    failureCode = "SAVE_FAILED"
    const { data, error } = await db.rpc<Receipt>("admin_complete_matching_run", {
      p_run_id: receipt.run.id, p_actor_admin_id: actorId, p_lease_token: receipt.lease_token,
      p_rows: result.rows, p_unmatched_ids: result.unmatchedIds.map((id) => idMap.get(id) ?? id),
    })
    if (error || !data?.run || !receiptResult(data)) {
      if (error?.message.includes("STALE") || error?.message.includes("ROUND_CHANGED")) failureCode = "ROUND_CHANGED"
      if (error?.message.includes("PRIVACY") || error?.message.includes("REDACTED")) failureCode = "PRIVACY_REDACTED"
      throw new Error(failureCode)
    }
    invalidate(roundId)
    return receiptResult(data)!
  } catch (error) {
    if (error instanceof Error && error.message === "VERSION_UNSUPPORTED") failureCode = "VERSION_UNSUPPORTED"
    const result = await recordFailure(db, receipt, actorId, failureCode)
    invalidate(roundId)
    return result
  }
}

export async function startRoundMatching(roundId: string, sessionName: string, rawReason: string, requestId: string): Promise<RoundRunResult> {
  const admin = await requireAdmin()
  const reason = normalizeAdminAuditReason(rawReason)
  if (!reason.ok) return { error: reason.error }
  if (!isUuid(requestId)) return { error: "运行编号无效，请刷新后重试。" }
  return executeRoundRun(roundId, sessionName.trim() || `${new Date().toLocaleDateString("zh-CN")} 匹配`, reason.reason, requestId, admin.id)
}

export async function resumeMatchingRun(runId: string, rawReason: string): Promise<RoundRunResult> {
  const admin = await requireAdmin()
  const reason = normalizeAdminAuditReason(rawReason)
  if (!reason.ok) return { error: reason.error }
  if (!isUuid(runId)) return { error: "运行编号无效，请刷新后重试。" }
  const db = createAdminClient() as unknown as RpcClient
  const receipt = await readReceipt(db, runId, admin.id)
  if (!receipt) return { error: "无法读取本次运行，请刷新核对编号和操作权限。" }
  const terminal = receiptResult(receipt)
  if (terminal) return terminal
  return executeRoundRun(receipt.run.round_id, receipt.run.session_name, reason.reason, runId, admin.id)
}

export async function abandonRoundMatchingRun(runId: string, rawReason: string): Promise<RoundRunResult> {
  await requireAdmin()
  const reason = normalizeAdminAuditReason(rawReason)
  if (!reason.ok) return { error: reason.error }
  if (!isUuid(runId)) return { error: "运行编号无效，请刷新后重试。" }
  try {
    const db = await createClient() as unknown as RpcClient
    const { data, error } = await db.rpc<Receipt>("admin_abandon_matching_run", { p_run_id: runId, p_reason: reason.reason })
    if (error || !data?.run) return { error: rpcMessage(error, "无法作废，请刷新确认该运行是否仍在处理。") }
    invalidate(data.run.round_id)
    return { success: true, runId: data.run.id, status: data.run.status }
  } catch { return { error: "作废结果待确认，请刷新运行记录后重试。" } }
}
