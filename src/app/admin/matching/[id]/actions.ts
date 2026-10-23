"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import { matchingPublicationError, PUBLISHED_MATCH_EDIT_ERROR } from "@/lib/matching/publication-errors"
import { performMatchingAdjustment } from "@/lib/matching/adjustment-service"

type WritableSession = { status: string; round_id: string | null; publication_version: number }
type WritableResult = { status: string; session_id: string; member_a_id: string; member_b_id: string | null; group_members: string[] | null }
type SessionGuard = { session: WritableSession } | { error: string }
type ResultGuard = { result: WritableResult; session: WritableSession } | { error: string }
type OperationalRpcClient = {
  rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{
    data: T | null
    error: { code?: string; message: string } | null
  }>
}

function matchingStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "草稿",
    locked: "已锁定",
    cancelled: "已取消",
    confirmed: "已确认",
  }
  return labels[status] ?? `未知状态（${status}）`
}

async function getWritableSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
): Promise<SessionGuard> {
  const { data: session, error } = await supabase
    .from("match_sessions")
    .select("status, round_id, publication_version")
    .eq("id", sessionId)
    .single()

  if (error) return { error: "无法读取匹配会话，请稍后重试" }
  if (!session) return { error: "会话不存在" }
  if (!session.round_id) return { error: "旧测试匹配记录仅支持查看" }
  return { session }
}

async function getWritableResultSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  resultId: string,
): Promise<ResultGuard> {
  const { data: result } = await supabase
    .from("match_results")
    .select("status, session_id, member_a_id, member_b_id, group_members")
    .eq("id", resultId)
    .single()

  if (!result) return { error: "配对结果不存在" }
  const guarded = await getWritableSession(supabase, result.session_id)
  if ("error" in guarded) return guarded
  if (guarded.session.status !== "draft") return { error: PUBLISHED_MATCH_EDIT_ERROR }
  return { result, session: guarded.session }
}

export async function lockPair(resultId: string, rawReason: string) {
  const admin = await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const supabase = await createClient()

  const guarded = await getWritableResultSession(supabase, resultId)
  if ("error" in guarded) return { error: guarded.error }
  if (guarded.result.status !== "draft") {
    return { error: `当前状态为「${matchingStatusLabel(guarded.result.status)}」，只有「草稿」状态才能锁定` }
  }

  const { data: updated, error } = await supabase
    .from("match_results")
    .update({
      status: "locked",
      locked_by: admin.id,
      locked_at: new Date().toISOString(),
      audit_reason: reasonResult.reason,
    })
    .eq("id", resultId)
    .eq("status", guarded.result.status)
    .select("id")
    .maybeSingle()

  if (error) {
    console.error("[lockPair]", error)
    return { error: matchingPublicationError(error, "操作失败") }
  }
  if (!updated) return { error: "配对状态已变化，请刷新后重试" }
  revalidatePath("/admin/matching", "layout")
  return { success: true }
}

export async function unlockPair(resultId: string, rawReason: string) {
  await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const supabase = await createClient()

  const guarded = await getWritableResultSession(supabase, resultId)
  if ("error" in guarded) return { error: guarded.error }
  if (guarded.result.status !== "locked") {
    return { error: `当前状态为「${matchingStatusLabel(guarded.result.status)}」，只有「已锁定」状态才能解锁` }
  }

  const { data: updated, error } = await supabase
    .from("match_results")
    .update({
      status: "draft",
      locked_by: null,
      locked_at: null,
      audit_reason: reasonResult.reason,
    })
    .eq("id", resultId)
    .eq("status", "locked")
    .select("id")
    .maybeSingle()

  if (error) {
    console.error("[unlockPair]", error)
    return { error: matchingPublicationError(error, "操作失败") }
  }
  if (!updated) return { error: "配对状态已变化，请刷新后重试" }
  revalidatePath("/admin/matching", "layout")
  return { success: true }
}

async function adjustExistingResult(kind: "split" | "restore", resultId: string, rawReason: string, operationId?: string, expectedRevision?: string) {
  await requireAdmin()
  const reason = normalizeAdminAuditReason(rawReason)
  if (!reason.ok) return { error: reason.error }
  const supabase = await createClient()
  const { data: result, error } = await supabase.from("match_results")
    .select("session_id").eq("id", resultId).single()
  if (error || !result?.session_id) return { error: "无法读取配对结果，请刷新后重试" }
  return performMatchingAdjustment({ sessionId: result.session_id, kind, resultId, rawReason: reason.reason, operationId, expectedRevision })
}

export async function splitPair(resultId: string, rawReason: string, operationId?: string, expectedRevision?: string) {
  return adjustExistingResult("split", resultId, rawReason, operationId, expectedRevision)
}

export async function restorePair(resultId: string, rawReason: string, operationId?: string, expectedRevision?: string) {
  return adjustExistingResult("restore", resultId, rawReason, operationId, expectedRevision)
}

type PublicationOperation = "admin_publish_match_session" | "admin_unpublish_match_session" | "admin_delete_match_session_draft"

async function changePublication(
  operation: PublicationOperation,
  sessionId: string,
  rawReason: string,
  expectedPublicationVersion: number,
) {
  await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  if (!Number.isSafeInteger(expectedPublicationVersion) || expectedPublicationVersion < 0) {
    return { error: "发布版本无效，请刷新后重试" }
  }
  const supabase = await createClient()

  // The database checks the browser's publication version under a round lock.
  // Session/results, allocations and notifications succeed or roll back together.
  const rpc = supabase as unknown as OperationalRpcClient
  const { data, error } = await rpc.rpc<{ round_id?: string | null }>(operation, {
    p_session_id: sessionId,
    p_reason: reasonResult.reason,
    p_expected_publication_version: expectedPublicationVersion,
  })
  if (error) {
    console.error(`[${operation}]`, error)
    return { error: matchingPublicationError(error, "操作失败，请刷新后重试") }
  }

  revalidatePath("/admin/matching", "layout")
  revalidatePath(`/admin/matching/${sessionId}`)
  if (data?.round_id) revalidatePath(`/admin/matching/rounds/${data.round_id}`)
  revalidatePath("/app/matches", "layout")
  revalidatePath("/app", "layout")
  return { success: true }
}

/** 删除草稿；数据库原子处理，不改变其他会话或收集状态。 */
export async function deleteSession(sessionId: string, rawReason: string, expectedPublicationVersion: number) {
  return changePublication("admin_delete_match_session_draft", sessionId, rawReason, expectedPublicationVersion)
}

export async function confirmSession(sessionId: string, rawReason: string, expectedPublicationVersion: number) {
  return changePublication("admin_publish_match_session", sessionId, rawReason, expectedPublicationVersion)
}

/** 撤回当前发布版本，停止用户访问并释放本轮占用。 */
export async function unpublishSession(sessionId: string, rawReason: string, expectedPublicationVersion: number) {
  return changePublication("admin_unpublish_match_session", sessionId, rawReason, expectedPublicationVersion)
}
