"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { normalizeMemberNumber } from "@/lib/member-master/member-number"
import { memberCenterErrorMessage, updateMemberSection } from "@/lib/queries/member-center"

export type UpdateMemberNumberResult =
  | { success: true; memberNumber: string }
  | { success: false; error: string }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function updateMemberNumber(
  memberId: string,
  rawMemberNumber: string,
  rawReason: string,
  expectedUpdatedAt: string,
): Promise<UpdateMemberNumberResult> {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { success: false, error: "仅超级管理员可修改会员编号" }
  if (!UUID_PATTERN.test(memberId)) return { success: false, error: "成员 ID 无效，请刷新后重试" }

  const memberNumber = normalizeMemberNumber(rawMemberNumber)
  if (!memberNumber) return { success: false, error: "会员编号格式应为 ZXS_001，数字至少 3 位" }
  if (!expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    return { success: false, error: "成员资料已变化，请刷新后重试" }
  }
  const reason = rawReason.trim()
  if (reason.length < 4) return { success: false, error: "请填写至少 4 个字符的修改原因" }
  if (reason.length > 500) return { success: false, error: "修改原因不得超过 500 个字符" }

  try {
    const result = await updateMemberSection({
      memberId,
      section: "account",
      payload: { member_number: memberNumber },
      reason,
      expectedUpdatedAt,
    })
    const saved = typeof result.data?.member_number === "string" ? result.data.member_number : memberNumber
    for (const path of ["/admin/members", `/admin/members/${memberId}`, "/admin/community/members", "/app", "/app/profile", "/app/profile/edit"]) {
      revalidatePath(path)
    }
    return { success: true, memberNumber: saved }
  } catch (error) {
    console.error("[updateMemberNumber]", error)
    return { success: false, error: memberCenterErrorMessage(error) }
  }
}
