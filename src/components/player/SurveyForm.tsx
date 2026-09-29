"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { submitSurvey } from "@/app/app/matching/survey/actions"
import { Button } from "@/components/ui/button"
import { localizeRoundText, normalizeRoundConfig } from "@/lib/matching/round-config"
import { validateSurveyAnswers } from "@/lib/matching/survey-answers"
import { surveySubmissionError } from "@/lib/matching/survey-window"
import { useSurveyWindow } from "@/lib/matching/use-survey-window"
import type { RoundContentConfig, RoundPurpose, SurveyAnswers } from "@/types/matching-round"
import { RoundDetails } from "./RoundDetails"
import { RoundFormFields } from "./RoundFormFields"

interface Props {
  roundId: string
  roundName: string
  surveyStart: string
  surveyEnd: string
  initialNow: string
  activityStart: string
  activityEnd: string
  purpose?: RoundPurpose
  config?: RoundContentConfig
  configRevision?: number
  fromParticipation?: boolean
  existing?: {
    game_type_pref: string
    gender_pref: string
    availability: Record<string, string[]>
    interest_tags: string[]
    social_style: string | null
    message: string | null
    custom_answers?: Record<string, string | string[]>
  } | null
}

export function SurveyForm({ roundId, roundName, surveyStart, surveyEnd, initialNow, activityStart, activityEnd,
  existing, purpose = "matching", config = normalizeRoundConfig(undefined), configRevision = 0, fromParticipation = false }: Props) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations("survey")
  const tErr = useTranslations("errors")
  const [value, setValue] = useState<SurveyAnswers>({
    gameTypePref: existing?.game_type_pref ?? "都可以", genderPref: existing?.gender_pref ?? "都可以",
    availability: existing?.availability ?? {}, interestTags: existing?.interest_tags ?? [],
    socialStyle: existing?.social_style ?? null, message: existing?.message ?? null, customAnswers: existing?.custom_answers ?? {},
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serverClosed, setServerClosed] = useState(false)
  const inFlight = useRef(false)
  const window = { status: "open", survey_start: surveyStart, survey_end: surveyEnd }
  const windowState = useSurveyWindow(window, initialNow)
  const blocked = windowState !== "open" || serverClosed
  const needsTime = purpose === "matching" && !Object.values(value.availability).some((slots) => slots.length > 0)

  async function handleSubmit() {
    if (inFlight.current || blocked || purpose === "announcement") return
    const windowError = surveySubmissionError(window)
    if (windowError) { setServerClosed(true); setError(tErr(windowError)); return }
    const validated = validateSurveyAnswers(value, purpose, config, activityStart, activityEnd)
    if (!validated.data) { setError(tErr(validated.error)); return }
    inFlight.current = true
    setSubmitting(true)
    setError(null)
    try {
      const res = await submitSurvey({ roundId, configRevision, ...validated.data })
      if (res.error) {
        if (["surveyExpired", "surveyClosed", "surveyNotStarted", "roundNotFound", "surveyUpdated", "surveyReadOnly"].includes(res.error)) setServerClosed(true)
        setError(tErr.has(res.error) ? tErr(res.error) : res.error)
        return
      }
      router.push(`/app/matching/survey/success?roundId=${encodeURIComponent(roundId)}${fromParticipation ? "&from=participation" : ""}`)
    } catch {
      setError(tErr("networkError"))
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 pb-40">
      <RoundDetails roundName={roundName} purpose={purpose} config={config} surveyEnd={surveyEnd} />
      {purpose !== "announcement" && <>
        <fieldset disabled={blocked || submitting} className="space-y-6 disabled:opacity-70">
          <RoundFormFields purpose={purpose} config={config} activityStart={activityStart} activityEnd={activityEnd}
            value={value} onChange={setValue} />
        </fieldset>
        {error && <p role="alert" className="text-center text-sm text-destructive">{error}</p>}
        <div className="player-app-action-bar fixed bottom-16 left-0 right-0 z-40 border-t border-border bg-background/90 p-4 backdrop-blur-md">
          {blocked && <p role="status" className="mb-3 text-sm">{t("unavailableWhileFilling")}</p>}
          <Button onClick={handleSubmit} disabled={blocked || submitting || needsTime} className="w-full">
            {submitting ? t("submitting") : existing ? t(purpose === "registration" ? "registration.update" : "update")
              : localizeRoundText(config.labels.submit, locale, t(purpose === "registration" ? "registration.submit" : "submit"))}
          </Button>
          {!blocked && needsTime && <p className="mt-2 text-center text-xs text-muted-foreground">{t("noTimeSlotHint")}</p>}
        </div>
      </>}
    </div>
  )
}
