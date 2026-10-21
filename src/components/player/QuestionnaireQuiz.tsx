"use client"

import { useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Check, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { validateAnswers } from "@/lib/questionnaires/validation"
import type { QuestionnaireAnswers, QuestionnaireTemplate } from "@/lib/questionnaires/types"
import { QuestionnaireField, questionnaireText } from "./QuestionnaireFields"

/** Same one-question-at-a-time layout as the original test, with versioned answer values. */
export function QuestionnaireQuiz({ template, initialAnswers = {}, onComplete, preview = false }: {
  template: QuestionnaireTemplate
  initialAnswers?: QuestionnaireAnswers
  onComplete?: (answers: QuestionnaireAnswers) => void
  preview?: boolean
}) {
  const locale = useLocale()
  const t = useTranslations("quiz")
  const questions = useMemo(() => template.questions.filter((question) => question.active), [template])
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<QuestionnaireAnswers>(initialAnswers)
  const [finished, setFinished] = useState(false)
  const question = questions[current]
  if (!question) return null
  const currentValid = validateAnswers({ ...template, questions: [question] }, { [question.id]: answers[question.id] ?? null }, { existingAnswers: initialAnswers }).ok
  const complete = validateAnswers(template, answers, { existingAnswers: initialAnswers }).ok
  const progress = Math.round(((current + 1) / questions.length) * 100)
  function finish() {
    if (!complete) return
    if (preview) setFinished(true)
    else onComplete?.(answers)
  }
  return <div className="max-w-lg mx-auto space-y-6">
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-muted-foreground"><span>{t("title")}</span><span>{current + 1} / {questions.length}</span></div>
      <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} /></div>
    </div>
    <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 animate-fade-in">
      <p className="text-base font-medium leading-relaxed">{questionnaireText(question.label, locale)}{question.required && <span className="ml-1 text-destructive">*</span>}</p>
      {question.description && <p className="mt-2 text-xs text-muted-foreground">{questionnaireText(question.description, locale)}</p>}
    </div>
    {question.type === "single" ? <div role="group" aria-label={questionnaireText(question.label, locale)} className="space-y-3">
      {(question.options ?? []).map((option) => {
        const selected = String(answers[question.id] ?? "") === option.value
        return <button key={option.id} type="button" aria-pressed={selected} onClick={() => setAnswers((previous) => ({ ...previous, [question.id]: option.value }))} className={`w-full text-left rounded-xl p-4 ring-1 transition-all duration-200 ${selected ? "bg-primary/10 ring-primary text-foreground" : "bg-card ring-foreground/10 hover:ring-foreground/20 hover:bg-muted/50"}`}>
          <div className="flex items-start gap-3"><div className={`mt-0.5 size-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${selected ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>{selected && <Check className="size-3 text-primary-foreground" />}</div><span className="text-sm leading-relaxed">{questionnaireText(option.label, locale)}</span></div>
        </button>
      })}
    </div> : <QuestionnaireField question={question} kind="quiz" value={answers[question.id]} onChange={(value) => setAnswers((previous) => ({ ...previous, [question.id]: value }))} hideHeading />}
    {finished && <p role="status" className="text-sm text-primary">{locale === "ja" ? "プレビューの回答を完了しました。" : "预览作答完成。"}</p>}
    <div className="flex justify-between pt-2">
      <Button variant="outline" onClick={() => setCurrent((index) => index - 1)} disabled={current === 0}><ChevronLeft className="size-4" />{t("prevQuestion")}</Button>
      {current === questions.length - 1 ? <Button onClick={finish} disabled={!complete}><Check className="size-4" />{t("finish")}</Button> : <Button onClick={() => setCurrent((index) => index + 1)} disabled={!currentValid}>{t("nextQuestion")}<ChevronRight className="size-4" /></Button>}
    </div>
  </div>
}
