"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import type { InterviewEvalFormData } from "@/types"

export async function submitInterviewEval(memberId: string, data: InterviewEvalFormData) {
  const admin = await requireAdmin()
  const supabase = await createClient()

  // Upsert evaluation (one per member)
  const { error: evalError } = await supabase
    .from("interview_evaluations")
    .upsert(
      {
        member_id: memberId,
        interviewer_id: admin.id,
        ...data,
        // Remove attractiveness_score from eval (it goes to members table)
        attractiveness_score: undefined,
      },
      { onConflict: "member_id" }
    )

  if (evalError) return { error: evalError.message }

  // Update members table with interview info
  const { error: memberError } = await supabase
    .from("members")
    .update({
      interview_date: new Date().toISOString().split("T")[0],
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

  const { error } = await supabase
    .from("members")
    .update({ status })
    .eq("id", memberId)

  if (error) return { error: error.message }
  return { success: true }
}
