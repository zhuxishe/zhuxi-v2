"use client"

import { useState } from "react"
import { PersonalityQuiz } from "./PersonalityQuiz"
import { QuizResult } from "./QuizResult"
import { submitQuiz } from "@/app/app/profile/quiz/actions"
import type { DimensionScores } from "@/lib/constants/personality-quiz"

interface ExistingResult {
  scores: DimensionScores
  personalityType: string
}

interface Props {
  existing: ExistingResult | null
}

export function QuizPageClient({ existing }: Props) {
  const [result, setResult] = useState<ExistingResult | null>(existing)
  const [showQuiz, setShowQuiz] = useState(!existing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleComplete(answers: { questionId: number; score: number }[]) {
    setSubmitting(true)
    setError(null)
    const res = await submitQuiz(answers)
    setSubmitting(false)

    if (res.error) {
      setError(res.error)
      return
    }

    setResult({ scores: res.scores, personalityType: res.personalityType })
    setShowQuiz(false)
  }

  function handleRetake() {
    setResult(null)
    setShowQuiz(true)
    setError(null)
  }

  if (submitting) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">正在计算你的社交风格...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto space-y-4 py-10">
        <p className="text-sm text-destructive text-center">{error}</p>
        <div className="flex justify-center">
          <button
            onClick={() => setShowQuiz(true)}
            className="text-sm text-primary underline"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  if (!showQuiz && result) {
    return (
      <QuizResult
        scores={result.scores}
        personalityType={result.personalityType}
        onRetake={handleRetake}
      />
    )
  }

  return <PersonalityQuiz onComplete={handleComplete} />
}
