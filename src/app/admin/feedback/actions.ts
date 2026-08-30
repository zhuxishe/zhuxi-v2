"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import { PLAYER_FEEDBACK_STATUSES } from "@/types/player-feedback"
import type { AdminFeedbackActionState } from "@/types/player-feedback"

type FeedbackRpcClient = {
  rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{
    data: T | null
    error: { code?: string; message: string } | null
  }>
}

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
  const reasonResult = normalizeAdminAuditReason(value(formData, "auditReason"))

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return { error: "反馈记录无效" }
  }
  if (!PLAYER_FEEDBACK_STATUSES.some((item) => item === status)) {
    return { error: "处理状态无效" }
  }
  if (Array.from(adminNote).length > 2000) return { error: "管理员备注不能超过 2000 个字" }
  if (Number.isNaN(Date.parse(expectedUpdatedAt))) return { error: "页面数据已失效，请刷新后重试" }
  if (!reasonResult.ok) return { error: reasonResult.error }

  const supabase = await createClient()
  const rpc = supabase as unknown as FeedbackRpcClient
  const { error } = await rpc.rpc<unknown>("admin_update_player_feedback", {
    p_feedback_id: id,
    p_status: status,
    p_admin_note: adminNote || null,
    p_reason: reasonResult.reason,
    p_expected_updated_at: expectedUpdatedAt,
  })
  if (error) {
    console.error("[updatePlayerFeedbackAction]", error)
    if (error.message.includes("MEMBER_MASTER_FEEDBACK_CONCURRENT_MODIFICATION")) {
      return { error: "这条反馈已被其他管理员更新，请刷新页面后再操作" }
    }
    if (error.message.includes("MEMBER_MASTER_FEEDBACK_NOT_FOUND")) {
      return { error: "反馈不存在或已被删除" }
    }
    return { error: "保存失败，请稍后重试" }
  }

  revalidatePath("/admin/feedback")
  return { success: true }
}
