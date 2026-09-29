"use client"

import { useLocale, useTranslations } from "next-intl"
import { localizeRoundText } from "@/lib/matching/round-config"
import type { RoundContentConfig, RoundPurpose, SurveyAnswers } from "@/types/matching-round"
import { TimeGridSelector } from "./TimeGridSelector"
import { SurveyPreferences } from "./SurveyPreferences"
import { SurveyOptionalFields } from "./SurveyOptionalFields"
import { RoundCustomQuestion } from "./RoundCustomQuestion"

interface Props {
  purpose: RoundPurpose
  config: RoundContentConfig
  activityStart: string
  activityEnd: string
  value: SurveyAnswers
  onChange: (value: SurveyAnswers) => void
}

/** Used by both the player form and the admin's interactive draft preview. */
export function RoundFormFields({ purpose, config, activityStart, activityEnd, value, onChange }: Props) {
  const t = useTranslations("survey")
  const locale = useLocale()
  if (purpose === "announcement") return null
  return (
    <div className="space-y-6">
      {purpose === "matching" ? <>
        <SurveyPreferences config={config} value={value} onChange={onChange} />
        <section className="space-y-3">
          <h2 className="heading-display break-words text-sm">{localizeRoundText(config.labels.availability, locale, t("timeSlots.title"))}</h2>
          <p className="text-xs text-muted-foreground">{t("timeSlots.hint")}</p>
          <TimeGridSelector startDate={activityStart} endDate={activityEnd} value={value.availability}
            onChange={(availability) => onChange({ ...value, availability })} />
        </section>
        <SurveyOptionalFields config={config} value={value} onChange={onChange} />
      </> : <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{t("registration.confirmHint")}</p>}
      {config.questions.map((question) => (
        <RoundCustomQuestion key={question.id} question={question} value={value.customAnswers[question.id]}
          onChange={(answer) => onChange({ ...value, customAnswers: { ...value.customAnswers, [question.id]: answer } })} />
      ))}
    </div>
  )
}
