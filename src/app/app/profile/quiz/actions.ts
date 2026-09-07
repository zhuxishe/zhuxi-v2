"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requirePlayer } from "@/lib/auth/player"
import {
  calculateScores,
  generatePersonalityType,
  type DimensionScores,
} from "@/lib/constants/personality-quiz"
import { getQuizConfig } from "@/lib/queries/quiz-config"
import { parseQuizAnswers } from "@/lib/forms/player-enrichment"

interface QuizResult {
  scores: DimensionScores
  personalityType: string
  error?: string
}

export async function submitQuiz(
  answers: { questionId: number; score: number }[]
): Promise<QuizResult> {
  const player = await requirePlayer()
  try {
    const config = await getQuizConfig()
    const validatedAnswers = parseQuizAnswers(answers, config)
    if (!validatedAnswers) {
      return { scores: { E: 0, A: 0, O: 0, C: 0, N: 0 }, personalityType: "", error: "invalidQuizAnswers" }
    }
    const scores = calculateScores(validatedAnswers, config.scoring, config.questions)
    const personalityType = generatePersonalityType(scores, config.typeLabels.formal, config.scoring.invertN)
    const supabase = await createClient()

    const { data: saved, error } = await supabase
      .from("personality_quiz_results")
      .upsert({
        member_id: player.memberId,
        answers: validatedAnswers,
        score_e: scores.E,
        score_a: scores.A,
        score_o: scores.O,
        score_c: scores.C,
        score_n: scores.N,
        personality_type: personalityType,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "member_id" })
      .select("member_id")
      .single()

    if (error || saved?.member_id !== player.memberId) {
      console.error("[submitQuiz]", error?.code ?? "missing_saved_member")
      return { scores, personalityType, error: "saveFailed" }
    }

    revalidatePath("/app")
    revalidatePath("/app/profile")
    revalidatePath("/app/profile/quiz")
    revalidatePath("/admin")
    revalidatePath("/admin/members")
    revalidatePath(`/admin/members/${player.memberId}`)
    return { scores, personalityType }
  } catch {
    return {
      scores: { E: 0, A: 0, O: 0, C: 0, N: 0 },
      personalityType: "",
      error: "submitFailed",
    }
  }
}
