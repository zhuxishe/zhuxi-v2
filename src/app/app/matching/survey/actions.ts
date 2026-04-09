"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requirePlayer } from "@/lib/auth/player"

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
    .select("id, status, survey_end")
    .eq("id", input.roundId)
    .single()

  if (roundErr || !round) return { error: roundErr?.message ?? "roundNotFound" }
  if (round.status !== "open") return { error: "surveyClosed" }

  // 检查截止时间
  if (new Date(round.survey_end) < new Date()) {
    return { error: "surveyExpired" }
  }

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

  if (error) return { error: error.message }
  revalidatePath("/app/matching")
  return { success: true }
}
