"use server"

import { createClient } from "@/lib/supabase/server"
import type { PreInterviewFormData } from "@/types"

export interface SubmitResult {
  success: boolean
  error?: string
}

export async function submitPreInterviewForm(
  data: PreInterviewFormData
): Promise<SubmitResult> {
  const supabase = await createClient()

  // 1. Create member record
  const { data: member, error: memberError } = await supabase
    .from("members")
    .insert({ status: "pending" })
    .select("id")
    .single()

  if (memberError || !member) {
    return { success: false, error: memberError?.message ?? "创建会员记录失败" }
  }

  // 2. Create identity record linked to member
  const { error: identityError } = await supabase
    .from("member_identity")
    .insert({
      member_id: member.id,
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
    })

  if (identityError) {
    return { success: false, error: identityError.message }
  }

  return { success: true }
}
