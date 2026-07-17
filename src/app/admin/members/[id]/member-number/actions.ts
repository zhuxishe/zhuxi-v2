"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"

interface MemberNumberRpcClient {
  rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{
    data: T | null
    error: { message: string } | null
  }>
}

export type UpdateMemberNumberResult =
  | { success: true; memberNumber: string }
  | { success: false; error: string }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function memberNumberError(message: string) {
  if (message.includes("MEMBER_NUMBER_TAKEN")) return "该会员编号已被使用"
  if (message.includes("MEMBER_NUMBER_INVALID")) return "会员编号必须为 1–64 个字符"
  if (message.includes("MEMBER_NOT_FOUND")) return "成员不存在或已被删除"
  if (message.includes("SUPER_ADMIN_REQUIRED")) return "仅超级管理员可修改会员编号"
  return "会员编号保存失败，请刷新后重试"
}

export async function updateMemberNumber(
  memberId: string,
  rawMemberNumber: string,
): Promise<UpdateMemberNumberResult> {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") {
    return { success: false, error: "仅超级管理员可修改会员编号" }
  }
  if (!UUID_PATTERN.test(memberId)) {
    return { success: false, error: "成员识别信息无效，请刷新后重试" }
  }

  const memberNumber = rawMemberNumber.trim()
  if (!memberNumber || memberNumber.length > 64) {
    return { success: false, error: "会员编号必须为 1–64 个字符" }
  }

  const supabase = await createClient() as unknown as MemberNumberRpcClient
  const { data, error } = await supabase.rpc<string>("admin_update_member_number", {
    p_member_id: memberId,
    p_member_number: memberNumber,
    p_audit_reason: "后台成员详情页修改会员编号",
  })

  if (error) {
    console.error("[updateMemberNumber]", error)
    return { success: false, error: memberNumberError(error.message) }
  }

  const savedMemberNumber = data?.trim()
  if (!savedMemberNumber) {
    return { success: false, error: "会员编号保存失败，请刷新后重试" }
  }

  revalidatePath("/admin/members")
  revalidatePath(`/admin/members/${memberId}`)
  revalidatePath("/admin/community/members")
  revalidatePath("/admin/community/moderation")
  revalidatePath("/app/profile")
  return { success: true, memberNumber: savedMemberNumber }
}
