"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requirePlayer } from "@/lib/auth/player"
import { surveySubmissionError } from "@/lib/matching/survey-window"

interface SubmitSurveyInput {
  roundId: string
  gameTypePref: string
  genderPref: string
  availability: Record<string, string[]>
  interestTags: string[]
  socialStyle: string | null
  message: string | null
}

export async function submitSurvey(input: SubmitSurveyInput) {
  const player = await requirePlayer()
  const supabase = await createClient()

  // 验证轮次存在且 open
  const { data: round, error: roundErr } = await supabase
    .from("match_rounds")
    .select("id, status, survey_start, survey_end")
    .eq("id", input.roundId)
    .single()

  if (roundErr || !round) {
    if (roundErr) console.error("[submitSurvey] round query", roundErr)
    return { error: "roundNotFound" }
  }
  const windowError = surveySubmissionError(round)
  if (windowError) return { error: windowError }

  // 验证至少有一个时段
  const totalSlots = Object.values(input.availability).reduce((s, v) => s + v.length, 0)
  if (totalSlots === 0) return { error: "noTimeSlot" }

  // Upsert（同一轮次同一用户只能提交一次）
  const { error } = await supabase
    .from("match_round_submissions")
    .upsert(
      {
        round_id: input.roundId,
        member_id: player.memberId,
        game_type_pref: input.gameTypePref,
        gender_pref: input.genderPref,
        availability: input.availability,
        interest_tags: input.interestTags,
        social_style: input.socialStyle,
        message: input.message,
      },
      { onConflict: "round_id,member_id" },
    )

  if (error) {
    console.error("[submitSurvey] upsert", error)
    // The administrator may close the round while this request is in flight.
    const { data: current } = await supabase.from("match_rounds")
      .select("status, survey_start, survey_end").eq("id", input.roundId).maybeSingle()
    const currentError = current ? surveySubmissionError(current) : null
    if (currentError) return { error: currentError }
    return { error: "saveFailed" }
  }
  revalidatePath("/app")
  revalidatePath("/app/matching/survey")
  revalidatePath("/app/matching")
  return { success: true }
}
