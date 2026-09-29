"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import type { RoundContentDraft, SurveyAnswers } from "@/types"
import { PlayerHomeActionCard } from "@/components/player/home/PlayerHomeActionCard"
import { RoundDetails } from "@/components/player/RoundDetails"
import { RoundFormFields } from "@/components/player/RoundFormFields"
import { roundCardCopy } from "@/lib/matching/round-display"
import { localizeRoundText } from "@/lib/matching/round-config"
import { parseTokyoDateTimeLocal } from "@/lib/player-activity/tokyo-datetime"

export function RoundPreviewContent({ draft, view }: { draft: RoundContentDraft; view: "card" | "form" }) {
  const locale = useLocale()
  const home = useTranslations("playerHome")
  const rounds = useTranslations("rounds")
  const survey = useTranslations("survey")
  const [answers, setAnswers] = useState<SurveyAnswers>({ gameTypePref: "都可以", genderPref: "都可以", availability: {}, interestTags: [], socialStyle: null, message: null, customAnswers: {} })
  const { purpose, contentConfig: config } = draft
  const start = Date.parse(draft.activityStart), end = Date.parse(draft.activityEnd)
  const rangeTooLong = Number.isFinite(start) && Number.isFinite(end) && end - start > 99 * 86400000
  const previewEnd = rangeTooLong ? new Date(start + 99 * 86400000).toISOString().slice(0, 10) : draft.activityEnd
  const defaults = purpose === "matching" ? { title: home("action.survey.title"), description: home("action.survey.description"), cta: home("action.survey.cta") } : { title: rounds(`purpose.${purpose}`), description: rounds(`description.${purpose}`), cta: rounds(`cta.${purpose}`) }
  const copy = roundCardCopy({ id: "preview", round_name: draft.roundName, status: "draft", purpose, content_config: config, survey_start: draft.surveyStart, survey_end: draft.surveyEnd, activity_start: draft.activityStart, activity_end: draft.activityEnd }, locale, defaults)
  if (view === "card") return <div onClick={(event) => event.preventDefault()}><PlayerHomeActionCard action={{ ...copy, eyebrow: home("action.eyebrow"), href: "#round-preview" }} /></div>
  return <div className="space-y-6">
    <RoundDetails roundName={draft.roundName} purpose={purpose} config={config} surveyEnd={parseTokyoDateTimeLocal(draft.surveyEnd)} />
    {purpose === "matching" && rangeTooLong && <p className="text-xs text-destructive">预览最多显示 100 天，请缩小活动日期范围后保存。</p>}
    <RoundFormFields purpose={purpose} config={config} activityStart={draft.activityStart} activityEnd={previewEnd} value={answers} onChange={setAnswers} />
    {purpose !== "announcement" && <button type="button" disabled className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground opacity-80">{localizeRoundText(config.labels.submit, locale, purpose === "registration" ? survey("registration.submit") : survey("submit"))}</button>}
  </div>
}
