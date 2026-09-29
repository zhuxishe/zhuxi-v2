"use client"

import { useLocale, useTranslations } from "next-intl"
import { localizeRoundText } from "@/lib/matching/round-config"
import type { RoundQuestion } from "@/types/matching-round"

interface Props {
  question: RoundQuestion
  value: string | string[] | undefined
  onChange: (value: string | string[]) => void
}

export function RoundCustomQuestion({ question, value, onChange }: Props) {
  const locale = useLocale()
  const t = useTranslations("survey")
  const label = localizeRoundText(question.label, locale)
  const inputId = `round-question-${question.id}`
  return (
    <fieldset className="space-y-3">
      <legend className="heading-display max-w-full break-words text-sm">
        {label}{question.required && <span className="ml-2 text-xs text-muted-foreground">{t("requiredQuestion")}</span>}
      </legend>
      {question.type === "text" ? (
        <textarea id={inputId} aria-label={label} required={question.required} value={typeof value === "string" ? value : ""}
          rows={3} maxLength={2000} onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
      ) : (
        <div className="space-y-2">
          {question.options.map((option) => {
            const checked = question.type === "single" ? value === option.id : Array.isArray(value) && value.includes(option.id)
            return (
              <label key={option.id} className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${checked ? "border-primary bg-accent" : "border-border bg-card"}`}>
                <input type={question.type === "single" ? "radio" : "checkbox"} name={inputId} value={option.id}
                  checked={checked} className="shrink-0 accent-primary"
                  onChange={() => {
                    if (question.type === "single") return onChange(option.id)
                    const values = Array.isArray(value) ? value : []
                    onChange(checked ? values.filter((item) => item !== option.id) : [...values, option.id])
                  }} />
                <span className="min-w-0 break-words">{localizeRoundText(option.label, locale)}</span>
              </label>
            )
          })}
        </div>
      )}
      {question.type === "single" && !question.required && typeof value === "string" && value && (
        <button type="button" onClick={() => onChange("")} className="text-xs text-muted-foreground underline underline-offset-4">
          {t("clearAnswer")}
        </button>
      )}
    </fieldset>
  )
}
