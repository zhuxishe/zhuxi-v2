import { createHash } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadRoundImportReviewContext } from "./round-import-context"
import { buildRoundImportReview, importDigest, signImportPlan, verifyImportPlan } from "./round-import-plan"
import type { ImportChoices, ImportReceipt } from "./round-import-contract"

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function assertImportRequestId(requestId: string) {
  if (!uuid.test(requestId)) throw new Error("导入编号无效，请重新预览")
}
export function assertImportReason(reason: string) {
  const length = Array.from(reason.trim()).length
  if (length < 4 || length > 500) throw new Error("导入原因需为 4-500 个字符")
}
export async function previewRoundWorkbook(roundId: string, buffer: Buffer, actorId: string, choices: ImportChoices = {}) {
  const context = await loadRoundImportReviewContext(roundId, buffer, actorId)
  const { review, plan } = buildRoundImportReview({
    ...context, roundId, actorId, choices,
    fileHash: createHash("sha256").update(buffer).digest("hex"),
    affectedBatchIds: context.state.affected_batch_ids ?? [],
  })
  if (plan) review.planToken = signImportPlan(plan)
  return review
}

// PostgreSQL commits every write, audit entry and receipt together. A transport
// failure must never trigger compensating deletes of member or answer records.
export async function importRoundWorkbook(roundId: string, actorId: string, requestId: string, token: string, reason: string): Promise<ImportReceipt> {
  assertImportRequestId(requestId)
  assertImportReason(reason)
  const plan = verifyImportPlan(token, roundId, actorId)
  const db = createAdminClient()
  if (plan.expiresAt < Date.now()) {
    const receipt = await getRoundImportReceiptRecord(roundId, actorId, requestId)
    if (!receipt) throw new Error("导入预览已过期，请重新预览；尚未写入任何答卷")
    // Even an expired replay must match the original actor and request hash.
    // The RPC returns the existing receipt without reapplying any writes.
  }
  const { data, error } = await db.rpc("admin_apply_round_import" as never, {
    p_request_id: requestId, p_round_id: roundId, p_actor_admin_id: actorId,
    p_request_hash: importDigest({ plan, reason: reason.trim() }),
    p_file_sha256: plan.fileHash, p_reason: reason.trim(),
    p_expected_round_token: plan.roundToken, p_rows: plan.rows,
  } as never)
  if (error) throw error
  if (!data) throw new Error("未收到导入回执，请查询该编号的状态后再操作")
  return data as ImportReceipt
}
export async function getRoundImportReceiptRecord(roundId: string, actorId: string, requestId: string): Promise<ImportReceipt | null> {
  assertImportRequestId(requestId)
  const { data, error } = await createAdminClient().rpc("admin_get_round_import" as never, {
    p_request_id: requestId, p_round_id: roundId, p_actor_admin_id: actorId,
  } as never)
  if (error) throw error
  return data as ImportReceipt | null
}
export async function listRoundImportRecords(roundId: string, actorId: string): Promise<ImportReceipt[]> {
  const { data, error } = await createAdminClient().rpc("admin_list_round_imports" as never, { p_round_id: roundId, p_actor_admin_id: actorId } as never)
  if (error) throw error
  return (data ?? []) as ImportReceipt[]
}
export async function cancelRoundImportOperation(roundId: string, actorId: string, requestId: string, reason: string): Promise<ImportReceipt> {
  assertImportRequestId(requestId)
  assertImportReason(reason)
  const { data, error } = await createAdminClient().rpc("admin_cancel_round_import_request" as never, {
    p_request_id: requestId, p_round_id: roundId, p_actor_admin_id: actorId, p_reason: reason.trim(),
  } as never)
  if (error) throw error
  if (!data) throw new Error("无法确认该导入编号的状态，请重试查询")
  return data as ImportReceipt
}
