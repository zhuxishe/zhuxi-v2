"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { memberCenterErrorMessage, updateMemberSection } from "@/lib/queries/member-center"

export async function updateVerification(
  memberId: string,
  data: { student_id_verified: boolean; photo_verified: boolean },
  rawReason: string,
) {
  await requireAdmin()
  const reason = rawReason.trim()
  if (reason.length < 4) return { error: "请填写至少 4 个字符的核验原因" }
  if (reason.length > 500) return { error: "核验原因不得超过 500 个字符" }

  try {
    await updateMemberSection({ memberId, section: "verification", payload: data, reason })
    revalidatePath(`/admin/members/${memberId}`)
    revalidatePath(`/admin/members/${memberId}/verify`)
    return { success: true }
  } catch (error) {
    console.error("[updateVerification]", error)
    return { error: memberCenterErrorMessage(error) }
  }
}
