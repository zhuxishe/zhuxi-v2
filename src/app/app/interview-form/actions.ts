"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/auth/player"
import type { PreInterviewFormData } from "@/types"

export interface SubmitResult {
  success: boolean
  error?: string
}

export async function submitPreInterviewForm(
  data: PreInterviewFormData
): Promise<SubmitResult> {
  const user = await requireAuth()
  const supabase = await createClient()

  // Check if member already exists for this user
  const { data: existing } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", user.id)
    .single()

  let memberId: string

  if (existing) {
    memberId = existing.id
  } else {
    // Create member record linked to auth user
    const { data: member, error: memberError } = await supabase
      .from("members")
      .insert({
        status: "pending",
        user_id: user.id,
        email: user.email,
      })
      .select("id")
      .single()

    if (memberError || !member) {
      return { success: false, error: memberError?.message ?? "Failed" }
    }
    memberId = member.id
  }

  // Upsert identity record
  const { error: identityError } = await supabase
    .from("member_identity")
    .upsert({
      member_id: memberId,
      full_name: data.full_name.trim(),
      nickname: data.nickname.trim() || null,
      gender: data.gender,
      age_range: data.age_range,
      nationality: data.nationality,
      current_city: data.current_city,
      school_name: data.school_name.trim() || null,
      department: data.department.trim() || null,
      degree_level: data.degree_level || null,
      course_language: data.course_language || null,
      enrollment_year: data.enrollment_year,
      hobby_tags: data.hobby_tags,
      activity_type_tags: data.activity_type_tags,
      personality_self_tags: data.personality_self_tags,
      taboo_tags: data.taboo_tags,
    }, { onConflict: "member_id" })

  if (identityError) {
    return { success: false, error: identityError.message }
  }

  return { success: true }
}
