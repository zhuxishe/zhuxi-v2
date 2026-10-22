"use client"

import { useRef, useState } from "react"
import { buildMatchingCompletionHref, type MatchingCompletionContext } from "@/lib/matching/completion-flow"
import { useQuestionnaireUnsavedChanges } from "./use-questionnaire-unsaved-changes"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { PersonalityQuiz } from "./PersonalityQuiz"
import { QuizResult } from "./QuizResult"
import { startQuizRetake, submitQuiz } from "@/app/app/profile/quiz/actions"
import type { DimensionScores } from "@/lib/constants/personality-quiz"
import type { QuizConfig } from "@/types/quiz-config"
import type { QuizAnswer } from "@/lib/forms/player-enrichment"
import { Button } from "@/components/ui/button"
import type { QuestionnaireAnswers, QuestionnaireRuntime } from "@/lib/questionnaires/types"
import { answersFromLegacy, quizAnswersFromTemplate, quizTemplateToConfig } from "@/lib/questionnaires/defaults"
import { QuestionnaireQuiz } from "./QuestionnaireQuiz"
import { questionnaireError } from "./questionnaire-client"

interface ExistingResult {
  scores: DimensionScores
  personalityType: string
}

interface Props {
  existing: ExistingResult | null
  quizConfig: QuizConfig
  questionnaire?: QuestionnaireRuntime | null
  completionContext?: MatchingCompletionContext | null
}

export function QuizPageClient({ existing, quizConfig, questionnaire, completionContext }: Props) {
  const router = useRouter()
  const t = useTranslations("quiz")
  const tErr = useTranslations("errors")
  const locale = useLocale()
  const unsaved = useQuestionnaireUnsavedChanges(locale)
  const [result, setResult] = useState<ExistingResult | null>(existing)
  const [showQuiz, setShowQuiz] = useState(!existing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingAnswers, setPendingAnswers] = useState<QuizAnswer[] | QuestionnaireAnswers | null>(null)

  const [runtime, setRuntime] = useState(questionnaire)
  const [config, setConfig] = useState(quizConfig)
  const operationPending = useRef(false)

  async function handleComplete(answers: QuizAnswer[] | QuestionnaireAnswers) {
    if (submitting || operationPending.current) return
    operationPending.current = true
    setSubmitting(true)
    setPendingAnswers(answers)
    setError(null)
    try {
      const context = runtime?.versionId ? {
        versionId: runtime.versionId, revision: runtime.revision,
        answers: Array.isArray(answers) ? answersFromLegacy(runtime.template, { answers }) : answers,
      } : undefined
      const res = await submitQuiz(Array.isArray(answers) ? answers : [], context)
      if (res.error) {
        setError(res.error)
        return
      }
      if (res.questionnaire) {
        setRuntime(res.questionnaire)
        setConfig(quizTemplateToConfig(res.questionnaire.template))
      }
      unsaved.markSaved()
      setResult({ scores: res.scores, personalityType: res.personalityType })
      setShowQuiz(false)
      setPendingAnswers(null)
      if (completionContext) router.replace(buildMatchingCompletionHref(completionContext))
      router.refresh()
    } catch {
      setError("networkError")
    } finally {
      operationPending.current = false
      setSubmitting(false)
    }
  }

  async function handleRetake() {
    if (submitting || operationPending.current) return
    if (runtime) {
      operationPending.current = true
      setSubmitting(true)
      setError(null)
      try {
        const next = await startQuizRetake()
        if (next.error) { setError(next.error); return }
        setRuntime(next.questionnaire)
        if (next.questionnaire) setConfig(quizTemplateToConfig(next.questionnaire.template))
      } catch { setError("networkError"); return }
      finally { operationPending.current = false; setSubmitting(false) }
    }
    setResult(null)
    setShowQuiz(true)
    setError(null)
    setPendingAnswers(null)
  }

  if (!showQuiz && result) {
    return (
      <>
      {submitting && <p role="status" className="text-center text-sm text-muted-foreground">{t("calculating")}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{tErr.has(error) ? tErr(error) : questionnaireError(error, locale)}</p>}
      <QuizResult
        scores={result.scores}
        personalityType={result.personalityType}
        dimensions={config.dimensions}
        typeLabels={config.typeLabels}
        typeDescriptions={config.typeDescriptions}
        invertN={config.scoring.invertN}
        onRetake={handleRetake}
      />
      </>
    )
  }

  return (
    <div className="space-y-4" aria-busy={submitting}>
      {submitting && <p role="status" className="text-center text-sm text-muted-foreground">{t("calculating")}</p>}
      {error && (
        <div className="max-w-lg mx-auto space-y-3">
          <p role="alert" className="text-sm text-destructive">{tErr.has(error) ? tErr(error) : questionnaireError(error, locale)}</p>
          <Button variant="outline" disabled={submitting} onClick={() => {
            if (error === "invalidQuizAnswers") { if (unsaved.confirmLeave()) window.location.reload() }
            else if (pendingAnswers) void handleComplete(pendingAnswers)
          }}>{t("retry")}</Button>
        </div>
      )}
      {/* Keep the questionnaire mounted during requests so every answer survives a failure. */}
      <fieldset disabled={submitting}>
        {runtime && !runtime.isBaseline ? <QuestionnaireQuiz key={runtime.versionId} template={runtime.template} initialAnswers={runtime.answers} onComplete={handleComplete} onAnswerChange={unsaved.markDirty} /> : <PersonalityQuiz questions={config.questions} initialAnswers={runtime ? quizAnswersFromTemplate(runtime.template, runtime.answers) : []} onComplete={handleComplete} onAnswerChange={unsaved.markDirty} />}
      </fieldset>
    </div>
  )
}
