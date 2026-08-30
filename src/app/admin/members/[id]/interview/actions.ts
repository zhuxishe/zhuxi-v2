"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { memberCenterErrorMessage, updateMemberSection } from "@/lib/queries/member-center"
import type { InterviewEvalFormData } from "@/types"

function normalizedReason(rawReason: string) {
  const reason = rawReason.trim()
  if (reason.length < 4) return { ok: false, error: "请填写至少 4 个字符的操作原因" } as const
  if (reason.length > 500) return { ok: false, error: "操作原因不得超过 500 个字符" } as const
  return { ok: true, reason } as const
}

export async function submitInterviewEval(
  memberId: string,
  data: InterviewEvalFormData,
  interviewDate: string | undefined,
  rawReason: string,
) {
  await requireAdmin()
  const reasonResult = normalizedReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }

  let interviewDateSaved = false
  try {
    if (interviewDate) {
      await updateMemberSection({
        memberId,
        section: "application",
        payload: { interview_date: interviewDate },
        reason: reasonResult.reason,
      })
      interviewDateSaved = true
    }
    await updateMemberSection({
      memberId,
      section: "interview_evaluation",
      payload: { ...data },
      reason: reasonResult.reason,
    })
    revalidatePath(`/admin/members/${memberId}`)
    revalidatePath(`/admin/members/${memberId}/interview`)
    return { success: true }
  } catch (error) {
    console.error("[submitInterviewEval]", error)
    const message = memberCenterErrorMessage(error)
    return {
      error: interviewDateSaved
        ? `面试日期已保存，但评估保存失败：${message}。请刷新后重试评估。`
        : message,
    }
  }
}

export async function updateMemberStatus(memberId: string, status: string, rawReason: string) {
  await requireAdmin()
  const validStatuses = ["pending", "approved", "rejected", "inactive"]
  if (!validStatuses.includes(status)) return { error: `无效审批状态：${status}` }
  const reasonResult = normalizedReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }

  try {
    await updateMemberSection({
      memberId,
      section: "application",
      payload: { status },
      reason: reasonResult.reason,
    })
    revalidatePath("/admin/members")
    revalidatePath(`/admin/members/${memberId}`)
    return { success: true }
  } catch (error) {
    console.error("[updateMemberStatus]", error)
    return { error: memberCenterErrorMessage(error) }
  }
}
