"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import type { InterviewEvalFormData } from "@/types"

export async function submitInterviewEval(
  memberId: string,
  data: InterviewEvalFormData,
  interviewDate?: string,
) {
  const admin = await requireAdmin()
  const supabase = await createClient()

  // Upsert evaluation — trigger `on_eval_upsert_sync_score` 会自动
  // 计算 AVG(attractiveness_score) 并同步到 members 表（同一事务）
  const { error: evalError } = await supabase
    .from("interview_evaluations")
    .upsert(
      { member_id: memberId, interviewer_id: admin.id, interviewer_name: admin.name, ...data },
      { onConflict: "member_id,interviewer_id" },
    )

  if (evalError) return { error: evalError.message }
  revalidatePath(`/admin/members/${memberId}`)
  return { success: true }
}

export async function updateMemberStatus(memberId: string, status: string) {
  await requireAdmin()

  const VALID_STATUSES = ['pending', 'approved', 'rejected', 'inactive']
  if (!VALID_STATUSES.includes(status)) {
    return { error: `无效状态: ${status}` }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("members").update({ status }).eq("id", memberId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/members/${memberId}`)
  return { success: true }
}
