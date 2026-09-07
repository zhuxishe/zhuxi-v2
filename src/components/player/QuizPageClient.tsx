"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { PersonalityQuiz } from "./PersonalityQuiz"
import { QuizResult } from "./QuizResult"
import { submitQuiz } from "@/app/app/profile/quiz/actions"
import type { DimensionScores } from "@/lib/constants/personality-quiz"
import type { QuizConfig } from "@/types/quiz-config"
import type { QuizAnswer } from "@/lib/forms/player-enrichment"
import { Button } from "@/components/ui/button"

interface ExistingResult {
  scores: DimensionScores
  personalityType: string
}

interface Props {
  existing: ExistingResult | null
  quizConfig: QuizConfig
}

export function QuizPageClient({ existing, quizConfig }: Props) {
  const router = useRouter()
  const t = useTranslations("quiz")
  const tErr = useTranslations("errors")
  const [result, setResult] = useState<ExistingResult | null>(existing)
  const [showQuiz, setShowQuiz] = useState(!existing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingAnswers, setPendingAnswers] = useState<QuizAnswer[] | null>(null)

  async function handleComplete(answers: { questionId: number; score: number }[]) {
    if (submitting) return
    setSubmitting(true)
    setPendingAnswers(answers)
    setError(null)
    try {
      const res = await submitQuiz(answers)
      if (res.error) {
        setError(res.error)
        return
      }
      setResult({ scores: res.scores, personalityType: res.personalityType })
      setShowQuiz(false)
      setPendingAnswers(null)
      router.refresh()
    } catch {
      setError("networkError")
    } finally {
      setSubmitting(false)
    }
  }

  function handleRetake() {
    setResult(null)
    setShowQuiz(true)
    setError(null)
    setPendingAnswers(null)
  }

  if (!showQuiz && result) {
    return (
      <QuizResult
        scores={result.scores}
        personalityType={result.personalityType}
        dimensions={quizConfig.dimensions}
        typeLabels={quizConfig.typeLabels}
        typeDescriptions={quizConfig.typeDescriptions}
        invertN={quizConfig.scoring.invertN}
        onRetake={handleRetake}
      />
    )
  }

  return (
    <div className="space-y-4" aria-busy={submitting}>
      {submitting && <p role="status" className="text-center text-sm text-muted-foreground">{t("calculating")}</p>}
      {error && (
        <div className="max-w-lg mx-auto space-y-3">
          <p role="alert" className="text-sm text-destructive">{tErr.has(error) ? tErr(error) : tErr("submitFailed")}</p>
          <Button variant="outline" disabled={submitting} onClick={() => {
            if (error === "invalidQuizAnswers") window.location.reload()
            else if (pendingAnswers) void handleComplete(pendingAnswers)
          }}>{t("retry")}</Button>
        </div>
      )}
      {/* Keep the questionnaire mounted during requests so every answer survives a failure. */}
      <fieldset disabled={submitting}>
        <PersonalityQuiz questions={quizConfig.questions} onComplete={handleComplete} />
      </fieldset>
    </div>
  )
}
