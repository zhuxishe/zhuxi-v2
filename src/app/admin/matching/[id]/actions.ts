"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { syncSessionSummary } from "@/lib/matching/session-summary-sync"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"

type WritableSession = { status: string; round_id: string | null }
type WritableResult = { status: string; session_id: string }
type SessionGuard = { session: WritableSession } | { error: string }
type ResultGuard = { result: WritableResult; session: WritableSession } | { error: string }
type OperationalRpcClient = {
  rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{
    data: T | null
    error: { code?: string; message: string } | null
  }>
}

function compensationReason(reason: string) {
  return `失败补偿：${reason}`.slice(0, 500)
}

async function getWritableSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
): Promise<SessionGuard> {
  const { data: session } = await supabase
    .from("match_sessions")
    .select("status, round_id")
    .eq("id", sessionId)
    .single()

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
    .select("status, session_id")
    .eq("id", resultId)
    .single()

  if (!result) return { error: "配对结果不存在" }
  const guarded = await getWritableSession(supabase, result.session_id)
  if ("error" in guarded) return guarded
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
    return { error: `当前状态为「${guarded.result.status}」，只有「draft」状态才能锁定` }
  }

  const { error } = await supabase
    .from("match_results")
    .update({
      status: "locked",
      locked_by: admin.id,
      locked_at: new Date().toISOString(),
      audit_reason: reasonResult.reason,
    })
    .eq("id", resultId)

  if (error) {
    console.error("[lockPair]", error)
    return { error: "操作失败" }
  }
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
    return { error: `当前状态为「${guarded.result.status}」，只有「locked」状态才能解锁` }
  }

  const { error } = await supabase
    .from("match_results")
    .update({
      status: "draft",
      locked_by: null,
      locked_at: null,
      audit_reason: reasonResult.reason,
    })
    .eq("id", resultId)
    .eq("status", "locked")

  if (error) {
    console.error("[unlockPair]", error)
    return { error: "操作失败" }
  }
  revalidatePath("/admin/matching", "layout")
  return { success: true }
}

export async function splitPair(resultId: string, rawReason: string) {
  await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const supabase = await createClient()

  const guarded = await getWritableResultSession(supabase, resultId)
  if ("error" in guarded) return { error: guarded.error }
  if (guarded.result.status !== "draft" && guarded.result.status !== "locked") {
    return { error: `当前状态为「${guarded.result.status}」，只有「draft」或「locked」状态才能拆分` }
  }

  const { error } = await supabase
    .from("match_results")
    .update({ status: "cancelled", audit_reason: reasonResult.reason })
    .eq("id", resultId)

  if (error) {
    console.error("[splitPair]", error)
    return { error: "操作失败" }
  }
  await syncSessionSummary(supabase, guarded.result.session_id, reasonResult.reason)
  revalidatePath("/admin/matching", "layout")
  return { success: true }
}

export async function restorePair(resultId: string, rawReason: string) {
  await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const supabase = await createClient()

  const guarded = await getWritableResultSession(supabase, resultId)
  if ("error" in guarded) return { error: guarded.error }
  if (guarded.result.status !== "cancelled") {
    return { error: `当前状态为「${guarded.result.status}」，只有「cancelled」状态才能恢复` }
  }

  const { error } = await supabase
    .from("match_results")
    .update({
      status: "draft",
      locked_by: null,
      locked_at: null,
      audit_reason: reasonResult.reason,
    })
    .eq("id", resultId)

  if (error) {
    console.error("[restorePair]", error)
    return { error: "操作失败" }
  }
  await syncSessionSummary(supabase, guarded.result.session_id, reasonResult.reason)
  revalidatePath("/admin/matching", "layout")
  return { success: true }
}

/** 删除整个匹配会话（含所有配对结果和未匹配诊断） */
export async function deleteSession(sessionId: string, rawReason: string) {
  await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const supabase = await createClient()

  const guarded = await getWritableSession(supabase, sessionId)
  if ("error" in guarded) return { error: guarded.error }
  if (guarded.session.status !== "draft") {
    return { error: `当前状态为「${guarded.session.status}」，只有「draft」状态才能删除` }
  }
  const roundId = guarded.session.round_id

  // The RPC keeps the session delete, cascades and per-member audit events in
  // one database transaction. A direct DELETE cannot carry a human reason.
  const rpc = supabase as unknown as OperationalRpcClient
  const { error } = await rpc.rpc<unknown>("admin_delete_operational_record", {
    p_entity: "match_sessions",
    p_id: sessionId,
    p_reason: reasonResult.reason,
  })

  if (error) {
    console.error("[deleteSession]", error)
    return { error: "删除失败" }
  }

  // 重置轮次状态为 closed（允许重新执行匹配）
  if (roundId) {
    const { error: roundResetError } = await supabase
      .from("match_rounds")
      .update({ status: "closed" })
      .eq("id", roundId)
      .eq("status", "matched")
    revalidatePath(`/admin/matching/rounds/${roundId}`)
    if (roundResetError) {
      console.error("[deleteSession:roundReset]", roundResetError)
      revalidatePath("/admin/matching")
      return { error: "会话已删除，但轮次状态重置失败，请人工检查该轮次状态" }
    }
  }

  revalidatePath("/admin/matching")
  return { success: true }
}

export async function confirmSession(sessionId: string, rawReason: string) {
  await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const supabase = await createClient()
  const guarded = await getWritableSession(supabase, sessionId)
  if ("error" in guarded) return { error: guarded.error }

  // 原子条件更新：只有 draft 状态才会被更新（防止并发重复确认）
  const { data: updated, error: sErr } = await supabase
    .from("match_sessions")
    .update({ status: "confirmed", audit_reason: reasonResult.reason })
    .eq("id", sessionId)
    .eq("status", "draft")
    .select("id")

  if (sErr) {
    console.error("[confirmSession:session]", sErr)
    return { error: "操作失败" }
  }
  if (!updated || updated.length === 0) {
    return { error: "会话不存在或已不是「draft」状态，请刷新后重试" }
  }

  // draft 和 locked 的配对都应确认（locked = 管理员已审核保留）
  const { error: rErr } = await supabase
    .from("match_results")
    .update({ status: "confirmed", audit_reason: reasonResult.reason })
    .eq("session_id", sessionId)
    .in("status", ["draft", "locked"])

  if (rErr) {
    // 补偿：回滚 session 状态，避免 session=confirmed 但 results 未更新
    const { data: rolledBack, error: rollbackError } = await supabase
      .from("match_sessions")
      .update({
        status: "draft",
        audit_reason: compensationReason(reasonResult.reason),
      })
      .eq("id", sessionId)
      .eq("status", "confirmed")
      .select("id")
    console.error("[confirmSession:results]", rErr)
    if (rollbackError || !rolledBack || rolledBack.length === 0) {
      console.error(
        "[confirmSession:compensation]",
        rollbackError ?? new Error("Session compensation updated no rows"),
      )
      return { error: "确认配对失败，且会话状态回滚失败；数据可能不一致，请人工检查" }
    }
    return { error: "操作失败，会话状态已回滚" }
  }
  revalidatePath(`/admin/matching/${sessionId}`)
  revalidatePath("/app/matches")
  return { success: true }
}

/** 撤回已发布的匹配 → session 和 results 回到 draft */
export async function unpublishSession(sessionId: string, rawReason: string) {
  await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const supabase = await createClient()
  const guarded = await getWritableSession(supabase, sessionId)
  if ("error" in guarded) return { error: guarded.error }

  const { data: updated, error: sErr } = await supabase
    .from("match_sessions")
    .update({ status: "draft", audit_reason: reasonResult.reason })
    .eq("id", sessionId)
    .eq("status", "confirmed")
    .select("id")

  if (sErr) {
    console.error("[unpublishSession:session]", sErr)
    return { error: "操作失败" }
  }
  if (!updated || updated.length === 0) {
    return { error: "会话不存在或不是「confirmed」状态" }
  }

  // confirmed → draft（排除已取消的）
  const { error: rErr } = await supabase
    .from("match_results")
    .update({ status: "draft", audit_reason: reasonResult.reason })
    .eq("session_id", sessionId)
    .eq("status", "confirmed")

  if (rErr) {
    // 补偿：回滚 session
    const { data: rolledBack, error: rollbackError } = await supabase
      .from("match_sessions")
      .update({
        status: "confirmed",
        audit_reason: compensationReason(reasonResult.reason),
      })
      .eq("id", sessionId)
      .eq("status", "draft")
      .select("id")
    console.error("[unpublishSession:results]", rErr)
    if (rollbackError || !rolledBack || rolledBack.length === 0) {
      console.error(
        "[unpublishSession:compensation]",
        rollbackError ?? new Error("Session compensation updated no rows"),
      )
      return { error: "撤回发布失败，且会话状态回滚失败；数据可能不一致，请人工检查" }
    }
    return { error: "操作失败，会话状态已回滚" }
  }

  revalidatePath(`/admin/matching/${sessionId}`)
  revalidatePath("/app/matches")
  return { success: true }
}
