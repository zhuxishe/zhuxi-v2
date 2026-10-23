"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { validateCompositeScoreValues } from "@/lib/member-master/composite-scores"
import { memberCenterErrorMessage } from "@/lib/queries/member-center"
import { updateMemberCompositeScores } from "@/lib/queries/member-composite-scores"
import type { MemberCompositeScoreValues } from "@/types/member-composite-scores"

export async function saveMemberCompositeScores(
  memberId: string,
  input: MemberCompositeScoreValues,
  expectedUpdatedAt: string | null,
  rawReason: string,
) {
  await requireAdmin()
  const scores = validateCompositeScoreValues(input)
  if (!scores) return { error: "四项评分均须为 1–5 的整数" }
  const reason = typeof rawReason === "string" ? rawReason.trim() : ""
  if (reason.length < 4 || reason.length > 500) return { error: "请填写 4–500 个字符的保存原因" }
  if (expectedUpdatedAt !== null && (typeof expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(expectedUpdatedAt)))) {
    return { error: "评分版本无效，请刷新后重试" }
  }

  try {
    const saved = await updateMemberCompositeScores({ memberId, scores, expectedUpdatedAt, reason })
    revalidatePath(`/admin/members/${memberId}`)
    revalidatePath(`/admin/members/${memberId}/interview`)
    return { success: true, scores: saved }
  } catch (error) {
    console.error("[saveMemberCompositeScores]", error)
    return { error: memberCenterErrorMessage(error) }
  }
}
