"use client"

import { useState, useMemo, useCallback } from "react"
import { ChevronLeft, ChevronRight, Check } from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import { Button } from "@/components/ui/button"
import { getQuizQuestions } from "@/lib/constants/personality-quiz-loader"

interface Props {
  onComplete: (answers: { questionId: number; score: number }[]) => void
}

/** Fisher-Yates shuffle (stable per question via seed) */
function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = seed
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280
    const j = Math.floor((s / 233280) * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function PersonalityQuiz({ onComplete }: Props) {
  const t = useTranslations("quiz")
  const locale = useLocale()
  const questions = useMemo(() => getQuizQuestions(locale), [locale])
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const total = questions.length
  const question = questions[current]
  const progress = Math.round(((current + 1) / total) * 100)

  // Shuffle options per question (stable across re-renders)
  const shuffledOptions = useMemo(
    () => shuffleWithSeed(question.options, question.id * 137),
    [question]
  )

  const selectOption = useCallback((score: number) => {
    setAnswers((prev) => ({ ...prev, [question.id]: score }))
  }, [question.id])

  function goNext() {
    if (current < total - 1) setCurrent((c) => c + 1)
  }

  function goPrev() {
    if (current > 0) setCurrent((c) => c - 1)
  }

  function handleFinish() {
    const result = questions.map((q) => ({
      questionId: q.id,
      score: answers[q.id] ?? 3,
    }))
    onComplete(result)
  }

  const isLast = current === total - 1
  const hasAnswer = answers[question.id] !== undefined
  const allAnswered = questions.every((q) => answers[q.id] !== undefined)

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Header + progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{t("title")}</span>
          <span>{current + 1} / {total}</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 animate-fade-in">
        <p className="text-base font-medium leading-relaxed">
          {question.text}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-3">
        {shuffledOptions.map((opt, i) => {
          const selected = answers[question.id] === opt.score
          return (
            <button
              key={i}
              onClick={() => selectOption(opt.score)}
              className={`w-full text-left rounded-xl p-4 ring-1 transition-all duration-200 ${
                selected
                  ? "bg-primary/10 ring-primary text-foreground"
                  : "bg-card ring-foreground/10 hover:ring-foreground/20 hover:bg-muted/50"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 size-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
                  selected ? "border-primary bg-primary" : "border-muted-foreground/30"
                }`}>
                  {selected && <Check className="size-3 text-primary-foreground" />}
                </div>
                <span className="text-sm leading-relaxed">{opt.text}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <Button
          variant="outline"
          onClick={goPrev}
          disabled={current === 0}
        >
          <ChevronLeft className="size-4" />
          {t("prevQuestion")}
        </Button>

        {isLast ? (
          <Button onClick={handleFinish} disabled={!allAnswered}>
            <Check className="size-4" />
            {t("finish")}
          </Button>
        ) : (
          <Button onClick={goNext} disabled={!hasAnswer}>
            {t("nextQuestion")}
            <ChevronRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
