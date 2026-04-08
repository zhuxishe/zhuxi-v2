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

  if (error) return { error: error.message }
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

  if (error) return { error: error.message }
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

  if (error) return { error: error.message }
  revalidatePath("/admin/matching", "layout")
  return { success: true }
}

export async function confirmSession(sessionId: string) {
  await requireAdmin()
  const supabase = await createClient()

  // 状态校验：只有 draft 状态的 session 才能确认
  const { data: session } = await supabase
    .from("match_sessions")
    .select("status")
    .eq("id", sessionId)
    .single()

  if (!session) return { error: "匹配会话不存在" }
  if (session.status !== "draft") {
    return { error: `当前会话状态为「${session.status}」，只有「draft」状态才能确认` }
  }

  const { error: sErr } = await supabase
    .from("match_sessions")
    .update({ status: "confirmed" })
    .eq("id", sessionId)

  if (sErr) return { error: sErr.message }

  const { error: rErr } = await supabase
    .from("match_results")
    .update({ status: "confirmed" })
    .eq("session_id", sessionId)
    .eq("status", "draft")

  if (rErr) return { error: rErr.message }
  revalidatePath(`/admin/matching/${sessionId}`)
  return { success: true }
}
