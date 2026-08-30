import { redirect } from "next/navigation"
import { getPlayerInfo } from "@/lib/auth/player"
import { resolvePlayerRoute } from "@/lib/auth/routing"
import { createClient } from "@/lib/supabase/server"
import {
  getOnboardingResumeStep,
  hydrateOnboardingDraft,
  type OnboardingIdentityDraft,
} from "@/lib/member-master/onboarding"
import { PreInterviewForm } from "@/components/player/PreInterviewForm"

export default async function AppInterviewFormPage() {
  const player = await getPlayerInfo()
  if (!player) redirect("/login")

  const route = resolvePlayerRoute({
    status: player.status,
    accountStatus: player.accountStatus,
    profileStage: player.profileStage,
    onboardingStep: player.onboardingStep,
    hasIdentity: player.hasIdentity,
  })

  if (route.action === "redirect" && route.to !== "/app/interview-form") {
    redirect(route.to)
  }
  if (route.action === "render") redirect("/app")

  let identity: OnboardingIdentityDraft | null = null
  if (player?.hasIdentity) {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("member_identity")
      .select("full_name, nickname, gender, age_range, nationality, current_city, school_name, department, degree_level, course_language, enrollment_year, hobby_tags, activity_type_tags, personality_self_tags, taboo_tags")
      .eq("member_id", player.memberId)
      .single()

    if (error) throw new Error("保存済みプロフィールを読み込めませんでした")
    if (data) {
      identity = data
    }
  }

  return (
    <PreInterviewForm
      defaultValues={hydrateOnboardingDraft(identity)}
      initialStep={getOnboardingResumeStep(player.hasIdentity ? player.onboardingStep : 0)}
      initialLastSavedAt={player.lastProfileSavedAt}
    />
  )
}
