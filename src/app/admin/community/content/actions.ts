"use server"

import { revalidatePath } from "next/cache"
import type { CommunityAdminModerationInput } from "@/lib/community/admin-content"
import { validateCommunityAdminModerationInput } from "@/lib/community/admin-content"
import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"

type CommunityRpcClient = {
  rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{
    data: T | null
    error: { code?: string; message: string } | null
  }>
}

function friendlyError(message: string) {
  if (message.includes("already has requested status")) return "内容状态刚刚已被其他管理员更新，请刷新页面"
  if (message.includes("Deleted") || message.includes("deleted")) return "已删除内容不能恢复或再次处理"
  if (message.includes("Only hidden")) return "只有已隐藏内容可以恢复"
  if (message.includes("not found")) return "内容不存在或已不可用"
  if (message.includes("reason")) return "处理原因无效"
  return "操作失败，请刷新后重试"
}

export async function moderateCommunityContent(input: CommunityAdminModerationInput) {
  const invalid = validateCommunityAdminModerationInput(input)
  if (invalid) return { success: false as const, error: invalid }

  const admin = await requireAdmin()
  const client = createAdminClient() as unknown as CommunityRpcClient
  const { error } = await client.rpc<null>("community_admin_moderate_content", {
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_status: input.status,
    p_reason_code: input.reasonCode,
    p_internal_note: input.internalNote?.trim() || null,
    p_admin_user_id: admin.id,
  })
  if (error) return { success: false as const, error: friendlyError(error.message) }

  revalidatePath("/admin/community")
  revalidatePath("/admin/community/content")
  revalidatePath("/admin/community/moderation")
  revalidatePath("/app/community")
  revalidatePath(`/app/community/treehole/${input.postId}`)
  revalidatePath(`/app/community/photos/${input.postId}`)
  return { success: true as const }
}
