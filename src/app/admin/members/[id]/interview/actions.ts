"use server"

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

  // Upsert: 同一面试官对同一成员只有一条记录（含 attractiveness_score）
  const { error: evalError } = await supabase
    .from("interview_evaluations")
    .upsert(
      { member_id: memberId, interviewer_id: admin.id, interviewer_name: admin.name, ...data },
      { onConflict: "member_id,interviewer_id" },
    )

  if (evalError) return { error: evalError.message }

  // 更新 members 表
  const date = interviewDate || new Date().toISOString().split("T")[0]
  const { error: memberError } = await supabase
    .from("members")
    .update({
      interview_date: date,
      interviewer: admin.name,
      attractiveness_score: data.attractiveness_score,
    })
    .eq("id", memberId)

  if (memberError) return { error: memberError.message }
  return { success: true }
}

export async function updateMemberStatus(memberId: string, status: string) {
  await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase.from("members").update({ status }).eq("id", memberId)
  if (error) return { error: error.message }
  return { success: true }
}
