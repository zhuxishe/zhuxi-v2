import { redirect } from "next/navigation"
import { requireAuth, getPlayerInfo } from "@/lib/auth/player"
import { createClient } from "@/lib/supabase/server"
import { PreInterviewForm } from "@/components/player/PreInterviewForm"
import type { PreInterviewFormData, Gender } from "@/types"
import { EMPTY_FORM } from "@/types"

export default async function AppInterviewFormPage() {
  await requireAuth()

  // Approved/inactive users should not access interview form
  const player = await getPlayerInfo()
  if (player && player.status === "approved") redirect("/app")
  if (player && player.status === "inactive") redirect("/app")

  // Pre-fill if identity already exists
  let defaultValues: PreInterviewFormData = EMPTY_FORM
  if (player?.hasIdentity) {
    const supabase = await createClient()
    const { data } = await supabase
      .from("member_identity")
      .select("full_name, nickname, gender, age_range, nationality, current_city, school_name, department, degree_level, course_language, enrollment_year, hobby_tags, activity_type_tags, personality_self_tags, taboo_tags")
      .eq("member_id", player.memberId)
      .single()

    if (data) {
      defaultValues = {
        full_name: data.full_name ?? "",
        nickname: data.nickname ?? "",
        gender: (data.gender as Gender) ?? "male",
        age_range: data.age_range ?? "",
        nationality: data.nationality ?? "",
        current_city: data.current_city ?? "",
        school_name: data.school_name ?? "",
        department: data.department ?? "",
        degree_level: data.degree_level ?? "",
        course_language: data.course_language ?? "",
        enrollment_year: data.enrollment_year ?? null,
        hobby_tags: data.hobby_tags ?? [],
        activity_type_tags: data.activity_type_tags ?? [],
        personality_self_tags: data.personality_self_tags ?? [],
        taboo_tags: data.taboo_tags ?? [],
      }
    }
  }

  return <PreInterviewForm defaultValues={defaultValues} />
}
