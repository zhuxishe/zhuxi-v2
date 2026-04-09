"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requirePlayer } from "@/lib/auth/player"
import {
  calculateScores,
  generatePersonalityType,
  type DimensionScores,
} from "@/lib/constants/personality-quiz"

interface QuizResult {
  scores: DimensionScores
  personalityType: string
  error?: string
}

export async function submitQuiz(
  answers: { questionId: number; score: number }[]
): Promise<QuizResult> {
  try {
    const player = await requirePlayer()
    const scores = calculateScores(answers)
    const personalityType = generatePersonalityType(scores)
    const supabase = await createClient()

    const { error } = await supabase
      .from("personality_quiz_results")
      .upsert({
        member_id: player.memberId,
        answers: JSON.stringify(answers),
        score_e: scores.E,
        score_a: scores.A,
        score_o: scores.O,
        score_c: scores.C,
        score_n: scores.N,
        personality_type: personalityType,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "member_id" })

    if (error) {
      console.error("[submitQuiz]", error)
      return { scores, personalityType, error: "saveFailed" }
    }

    revalidatePath("/app/profile")
    return { scores, personalityType }
  } catch {
    return {
      scores: { E: 0, A: 0, O: 0, C: 0, N: 0 },
      personalityType: "",
      error: "quizSubmitFailed",
    }
  }
}
