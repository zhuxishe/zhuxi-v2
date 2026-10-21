"use client"

import { useId, useState } from "react"
import { NextIntlClientProvider, useLocale } from "next-intl"
import zh from "@/messages/zh.json"
import ja from "@/messages/ja.json"
import type { QuestionnaireAnswer, QuestionnaireAnswers, QuestionnaireKind, QuestionnaireQuestion, QuestionnaireTemplate } from "@/lib/questionnaires/types"
import { SingleSelect } from "@/components/shared/SingleSelect"
import { MultiTagSelect } from "@/components/shared/MultiTagSelect"
import { SchoolSearchSelect } from "@/components/ui/SchoolSearchSelect"
import { MajorSearchSelect } from "@/components/ui/MajorSearchSelect"
import { StationSearchSelect } from "@/components/ui/StationSearchSelect"
import { PERSONALITY_DIMENSIONS } from "@/lib/constants/personality"
import { localizePersonalityOption } from "@/lib/constants/personality-i18n"
import { PersonalitySlider } from "./PersonalitySlider"
import { BirthdayPicker } from "./BirthdayPicker"
import { QuestionnaireQuiz } from "./QuestionnaireQuiz"
import { FormStepIndicator } from "@/components/shared/FormStepIndicator"
import { Button } from "@/components/ui/button"

const inputClass = "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
import { questionnaireText } from "./questionnaire-client"
export { questionnaireText } from "./questionnaire-client"

export function QuestionnaireField({ question, value, onChange, kind = "interview", hideHeading = false }: {
  question: QuestionnaireQuestion
  value: QuestionnaireAnswer | undefined
  onChange: (value: QuestionnaireAnswer) => void
  kind?: QuestionnaireKind
  hideHeading?: boolean
}) {
  const locale = useLocale()
  const id = useId()
  if (!question.active) return null
  const label = questionnaireText(question.label, locale)
  const description = questionnaireText(question.description, locale)
  const options = question.options ?? []
  const labels = Object.fromEntries(options.map((option) => [option.value, questionnaireText(option.label, locale)]))
  const selected = value === null || value === undefined ? "" : String(value)
  const numberValue = typeof value === "number" ? value : null
  const isPersonality = kind === "personality"
  const content = (() => {
    if (question.type === "single") return <SingleSelect options={options.map((option) => option.value)} value={selected} labels={labels} onChange={onChange} />
    if (question.type === "multi") return <MultiTagSelect options={options.map((option) => option.value)} value={Array.isArray(value) ? value : []} labels={labels} max={question.maxSelections} onChange={onChange} />
    if (question.type === "rating") {
      const dimension = PERSONALITY_DIMENSIONS.find((item) => item.key === question.builtinField)
      if ((question.min ?? 1) === 1 && (question.max ?? 5) === 5) return <PersonalitySlider value={numberValue} onChange={onChange} lowLabel={labels["1"] ?? (dimension?.sliderLabels ? localizePersonalityOption(dimension.sliderLabels[0], locale) : "1")} highLabel={labels["5"] ?? (dimension?.sliderLabels ? localizePersonalityOption(dimension.sliderLabels[1], locale) : "5")} />
      return <div className="flex flex-wrap gap-1.5">{Array.from({ length: (question.max ?? 5) - (question.min ?? 1) + 1 }, (_, index) => index + (question.min ?? 1)).map((score) => <button key={score} type="button" aria-pressed={score === numberValue} onClick={() => onChange(score)} className={`h-9 flex-1 rounded-lg px-2 text-xs font-medium ${score === numberValue ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>{score}</button>)}</div>
    }
    if (question.type === "textarea") return <textarea id={id} value={selected} onChange={(event) => onChange(event.target.value)} maxLength={question.maxLength} required={question.required} rows={3} className={inputClass} />
    if (question.type === "text") {
      if (question.builtinField === "school_name") return <SchoolSearchSelect value={selected} onChange={onChange} className={inputClass} />
      if (question.builtinField === "department") return <MajorSearchSelect value={selected} onChange={onChange} className={inputClass} />
      if (question.builtinField === "nearest_station") return <StationSearchSelect value={selected} onChange={onChange} className={inputClass} />
    }
    return <input id={id} type={question.type === "number" ? "number" : question.type === "date" ? "date" : "text"} value={selected} onChange={(event) => onChange(question.type === "number" ? event.target.value === "" ? null : Number(event.target.value) : event.target.value)} min={question.min} max={question.max} step={question.type === "number" ? "any" : undefined} maxLength={question.maxLength} required={question.required} className={inputClass} />
  })()
  // Keep the existing date wheel, including when its published wording changes.
  if (question.builtinField === "birth_date" && question.type === "date" && !hideHeading) return <BirthdayPicker value={selected} onChange={onChange} label={label} hint={description} required={question.required} />
  return <div className={isPersonality ? "rounded-xl bg-card p-4 ring-1 ring-foreground/10 space-y-2" : "space-y-2"}>
    {!hideHeading && <div>
      <label htmlFor={id} className={`text-sm font-medium text-foreground${isPersonality ? " font-semibold" : ""}`}>{label}{question.required && <span className="ml-1 text-destructive">*</span>}</label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>}
    <div role="group" aria-label={label}>{content}</div>
  </div>
}

export function QuestionnaireFields({ template, answers, onChange, sectionId }: {
  template: QuestionnaireTemplate
  answers: QuestionnaireAnswers
  onChange: (answers: QuestionnaireAnswers) => void
  sectionId?: string
}) {
  return <div className={template.kind === "interview" ? "space-y-4" : template.kind === "supplementary" ? "space-y-5" : "space-y-6"}>
    {template.questions.filter((question) => question.active && (!sectionId || question.sectionId === sectionId)).map((question) => <QuestionnaireField key={question.id} question={question} kind={template.kind} value={answers[question.id]} onChange={(value) => onChange({ ...answers, [question.id]: value })} />)}
  </div>
}

/** Local-only preview: no member identity, network calls or submissions. */
export function QuestionnairePreview({ template, locale: previewLocale }: { template: QuestionnaireTemplate; locale?: string }) {
  const currentLocale = useLocale()
  const locale = previewLocale ?? currentLocale
  return <NextIntlClientProvider locale={locale} messages={locale === "ja" ? ja : zh} timeZone="Asia/Tokyo"><QuestionnairePreviewContent template={template} /></NextIntlClientProvider>
}

function QuestionnairePreviewContent({ template }: { template: QuestionnaireTemplate }) {
  const locale = useLocale()
  const [answers, setAnswers] = useState<QuestionnaireAnswers>({})
  const [section, setSection] = useState(0)
  const sections = template.sections
  if (template.kind === "quiz") return <QuestionnaireQuiz key={JSON.stringify(template)} template={template} preview />
  return <div className="max-w-lg space-y-6">
    <h2 className="text-lg font-semibold">{questionnaireText(template.title, locale)}</h2>
    {sections.length > 1 && <FormStepIndicator steps={sections.map((item) => questionnaireText(item.title, locale))} currentStep={section} />}
    <QuestionnaireFields template={template} answers={answers} onChange={setAnswers} sectionId={sections[section]?.id} />
    {sections.length > 1 && <div className="flex justify-between"><Button variant="outline" disabled={section === 0} onClick={() => setSection((index) => index - 1)}>{locale === "ja" ? "前へ" : "上一步"}</Button><Button disabled={section === sections.length - 1} onClick={() => setSection((index) => index + 1)}>{locale === "ja" ? "次へ" : "下一步"}</Button></div>}
  </div>
}
