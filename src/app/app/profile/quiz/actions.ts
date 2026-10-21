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
import { resolveQuestionnaireSubmission } from "@/components/player/questionnaire-submit"
import type { QuestionnaireSubmitContext } from "@/components/player/questionnaire-client"
import type { QuestionnaireRuntime } from "@/lib/questionnaires/types"
import { quizAnswersFromTemplate, quizTemplateToConfig } from "@/lib/questionnaires/defaults"

interface QuizResult {
  scores: DimensionScores
  personalityType: string
  error?: string
  questionnaire?: QuestionnaireRuntime
}

export async function submitQuiz(
  answers: { questionId: number; score: number }[],
  context?: QuestionnaireSubmitContext
): Promise<QuizResult> {
  const player = await requirePlayer()
  try {
    context = await resolveQuestionnaireSubmission("quiz", context, { answers })
    if (context) {
      const { savePlayerQuestionnaire } = await import("@/lib/questionnaires/server")
      const saved = await savePlayerQuestionnaire("quiz", context.versionId, context.answers, { complete: true, expectedRevision: context.revision })
      if (!saved.success) return { scores: { E: 0, A: 0, O: 0, C: 0, N: 0 }, personalityType: "", error: saved.error }
      const config = quizTemplateToConfig(saved.runtime.template)
      const scoredAnswers = quizAnswersFromTemplate(saved.runtime.template, saved.runtime.answers)
      const scores = calculateScores(scoredAnswers, config.scoring, config.questions)
      const personalityType = generatePersonalityType(scores, config.typeLabels.formal, config.scoring.invertN)
      for (const path of ["/app", "/app/profile", "/app/profile/quiz", "/admin", "/admin/members", `/admin/members/${player.memberId}`]) revalidatePath(path)
      return { scores, personalityType, questionnaire: saved.runtime }
    }
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

/** A deliberate retake starts a new answer session on the latest published version. */
export async function startQuizRetake(): Promise<{ questionnaire?: QuestionnaireRuntime | null; error?: string }> {
  await requirePlayer()
  try {
    const { startQuestionnaireRetake } = await import("@/lib/questionnaires/server")
    return { questionnaire: await startQuestionnaireRetake("quiz") }
  } catch { return { error: "submitFailed" } }
}
