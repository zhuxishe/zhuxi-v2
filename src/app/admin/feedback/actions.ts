"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import { PLAYER_FEEDBACK_STATUSES } from "@/types/player-feedback"
import type { AdminFeedbackActionState } from "@/types/player-feedback"

function value(formData: FormData, key: string) {
  const entry = formData.get(key)
  return typeof entry === "string" ? entry : ""
}

export async function updatePlayerFeedbackAction(
  _previousState: AdminFeedbackActionState,
  formData: FormData,
): Promise<AdminFeedbackActionState> {
  await requireAdmin()
  const id = value(formData, "feedbackId")
  const status = value(formData, "status")
  const adminNote = value(formData, "adminNote").trim()
  const expectedUpdatedAt = value(formData, "expectedUpdatedAt")

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return { error: "反馈记录无效" }
  }
  if (!PLAYER_FEEDBACK_STATUSES.some((item) => item === status)) {
    return { error: "处理状态无效" }
  }
  if (Array.from(adminNote).length > 2000) return { error: "管理员备注不能超过 2000 个字" }
  if (Number.isNaN(Date.parse(expectedUpdatedAt))) return { error: "页面数据已失效，请刷新后重试" }

  const now = new Date().toISOString()
  const supabase = createAdminClient()
  const { data: current, error: readError } = await supabase
    .from("player_feedback")
    .select("status, completed_at, updated_at")
    .eq("id", id)
    .maybeSingle()
  if (readError) {
    console.error("[updatePlayerFeedbackAction] read", readError)
    return { error: "读取失败，请稍后重试" }
  }
  if (!current) return { error: "反馈不存在或已被删除" }
  if (current.updated_at !== expectedUpdatedAt) return { error: "这条反馈已被其他管理员更新，请刷新页面后再操作" }

  const completedAt = status === "completed"
    ? current.completed_at ?? now
    : null
  const { data, error } = await supabase
    .from("player_feedback")
    .update({
      status,
      admin_note: adminNote || null,
      completed_at: completedAt,
      updated_at: now,
    })
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select("id")
    .maybeSingle()
  if (error) {
    console.error("[updatePlayerFeedbackAction]", error)
    return { error: "保存失败，请稍后重试" }
  }
  if (!data) return { error: "这条反馈刚刚发生变化，请刷新页面后再操作" }

  revalidatePath("/admin/feedback")
  return { success: true }
}
