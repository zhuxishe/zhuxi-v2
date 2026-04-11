"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"

export async function lockPair(resultId: string) {
  const admin = await requireAdmin()
  const supabase = await createClient()

  // 状态校验：只有 draft 状态才能锁定
  const { data: current } = await supabase
    .from("match_results")
    .select("status")
    .eq("id", resultId)
    .single()

  if (!current) return { error: "配对结果不存在" }
  if (current.status !== "draft") {
    return { error: `当前状态为「${current.status}」，只有「draft」状态才能锁定` }
  }

  const { error } = await supabase
    .from("match_results")
    .update({
      status: "locked",
      locked_by: admin.id,
      locked_at: new Date().toISOString(),
    })
    .eq("id", resultId)

  if (error) {
    console.error("[lockPair]", error)
    return { error: "操作失败" }
  }
  revalidatePath("/admin/matching", "layout")
  return { success: true }
}

export async function splitPair(resultId: string) {
  await requireAdmin()
  const supabase = await createClient()

  // 状态校验：只有 draft 或 locked 状态才能拆分
  const { data: current } = await supabase
    .from("match_results")
    .select("status")
    .eq("id", resultId)
    .single()

  if (!current) return { error: "配对结果不存在" }
  if (current.status !== "draft" && current.status !== "locked") {
    return { error: `当前状态为「${current.status}」，只有「draft」或「locked」状态才能拆分` }
  }

  const { error } = await supabase
    .from("match_results")
    .update({ status: "cancelled" })
    .eq("id", resultId)

  if (error) {
    console.error("[splitPair]", error)
    return { error: "操作失败" }
  }
  revalidatePath("/admin/matching", "layout")
  return { success: true }
}

export async function restorePair(resultId: string) {
  await requireAdmin()
  const supabase = await createClient()

  // 状态校验：只有 cancelled 状态才能恢复
  const { data: current } = await supabase
    .from("match_results")
    .select("status")
    .eq("id", resultId)
    .single()

  if (!current) return { error: "配对结果不存在" }
  if (current.status !== "cancelled") {
    return { error: `当前状态为「${current.status}」，只有「cancelled」状态才能恢复` }
  }

  const { error } = await supabase
    .from("match_results")
    .update({ status: "draft", locked_by: null, locked_at: null })
    .eq("id", resultId)

  if (error) {
    console.error("[restorePair]", error)
    return { error: "操作失败" }
  }
  revalidatePath("/admin/matching", "layout")
  return { success: true }
}

/** 删除整个匹配会话（含所有配对结果和未匹配诊断） */
export async function deleteSession(sessionId: string) {
  await requireAdmin()
  const supabase = await createClient()

  // 状态校验：只有 draft 状态才能删除
  const { data: session } = await supabase
    .from("match_sessions")
    .select("status")
    .eq("id", sessionId)
    .single()

  if (!session) return { error: "会话不存在" }
  if (session.status !== "draft") {
    return { error: `当前状态为「${session.status}」，只有「draft」状态才能删除` }
  }

  // 获取关联的轮次 ID（用于重置轮次状态）
  const { data: sessionData } = await supabase
    .from("match_sessions")
    .select("round_id")
    .eq("id", sessionId)
    .single()
  const roundId = sessionData?.round_id

  // 按外键依赖顺序删除（CASCADE 应该处理，但显式更安全）
  await supabase.from("unmatched_diagnostics").delete().eq("session_id", sessionId)
  await supabase.from("match_results").delete().eq("session_id", sessionId)
  const { error } = await supabase.from("match_sessions").delete().eq("id", sessionId)

  if (error) {
    console.error("[deleteSession]", error)
    return { error: "删除失败" }
  }

  // 重置轮次状态为 closed（允许重新执行匹配）
  if (roundId) {
    await supabase
      .from("match_rounds")
      .update({ status: "closed" })
      .eq("id", roundId)
      .eq("status", "matched")
    revalidatePath(`/admin/matching/rounds/${roundId}`)
  }

  revalidatePath("/admin/matching")
  return { success: true }
}

export async function confirmSession(sessionId: string) {
  await requireAdmin()
  const supabase = await createClient()

  // 原子条件更新：只有 draft 状态才会被更新（防止并发重复确认）
  const { data: updated, error: sErr } = await supabase
    .from("match_sessions")
    .update({ status: "confirmed" })
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
    .update({ status: "confirmed" })
    .eq("session_id", sessionId)
    .in("status", ["draft", "locked"])

  if (rErr) {
    // 补偿：回滚 session 状态，避免 session=confirmed 但 results 未更新
    await supabase
      .from("match_sessions")
      .update({ status: "draft" })
      .eq("id", sessionId)
    console.error("[confirmSession:results]", rErr)
    return { error: "操作失败，会话状态已回滚" }
  }
  revalidatePath(`/admin/matching/${sessionId}`)
  revalidatePath("/app/matches")
  return { success: true }
}

/** 撤回已发布的匹配 → session 和 results 回到 draft */
export async function unpublishSession(sessionId: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { data: updated, error: sErr } = await supabase
    .from("match_sessions")
    .update({ status: "draft" })
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
    .update({ status: "draft" })
    .eq("session_id", sessionId)
    .eq("status", "confirmed")

  if (rErr) {
    // 补偿：回滚 session
    await supabase
      .from("match_sessions")
      .update({ status: "confirmed" })
      .eq("id", sessionId)
    console.error("[unpublishSession:results]", rErr)
    return { error: "操作失败，会话状态已回滚" }
  }

  revalidatePath(`/admin/matching/${sessionId}`)
  revalidatePath("/app/matches")
  return { success: true }
}
