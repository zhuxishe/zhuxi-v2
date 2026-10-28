"use client"

import { useRef, useState } from "react"
import { unstable_rethrow, useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { submitSurvey } from "@/app/app/matching/survey/actions"
import { localizeRoundText, normalizeRoundConfig } from "@/lib/matching/round-config"
import { validateSurveyAnswers } from "@/lib/matching/survey-answers"
import { surveySubmissionError } from "@/lib/matching/survey-window"
import { useSurveyWindow } from "@/lib/matching/use-survey-window"
import { registrationAnswersChanged } from "@/lib/matching/registration-answers"
import type { RoundContentConfig, RoundPurpose, SurveyAnswers } from "@/types/matching-round"
import { RoundDetails } from "./RoundDetails"
import { RoundFormFields } from "./RoundFormFields"
import { SurveyActionBar } from "./SurveyActionBar"
import { CancelRegistrationButton } from "./CancelRegistrationButton"
import { MatchingProfileDialog } from "./MatchingProfileDialog"
import { type MatchingProfileKind } from "@/lib/matching/profile-readiness"
import { buildMatchingCompletionHref } from "@/lib/matching/completion-flow"

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
    id?: string
    updated_at?: string | null
    cancelled_at?: string | null
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
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serverClosed, setServerClosed] = useState(false)
  const [missingProfiles, setMissingProfiles] = useState<MatchingProfileKind[] | null>(null)
  const [participationDenied, setParticipationDenied] = useState(false)
  const inFlight = useRef(false)
  const window = { status: "open", survey_start: surveyStart, survey_end: surveyEnd }
  const windowState = useSurveyWindow(window, initialNow)
  const unavailable = windowState !== "open" || serverClosed
  const blocked = unavailable || missingProfiles !== null || participationDenied
  const needsTime = purpose === "matching" && !Object.values(value.availability).some((slots) => slots.length > 0)
  const registered = purpose === "registration" && Boolean(existing) && !existing?.cancelled_at
  const unchanged = registered && !registrationAnswersChanged(config.questions, existing?.custom_answers ?? {}, value.customAnswers)

  async function handleSubmit() {
    if (inFlight.current || cancelling || blocked || unchanged || purpose === "announcement") return
    const windowError = surveySubmissionError(window)
    if (windowError) { setServerClosed(true); setError(tErr(windowError)); return }
    const validated = validateSurveyAnswers(value, purpose, config, activityStart, activityEnd)
    if (!validated.data) { setError(tErr(validated.error)); return }
    inFlight.current = true
    setSubmitting(true)
    setError(null)
    try {
      const res = await submitSurvey({ roundId, configRevision, ...validated.data,
        ...(purpose === "registration" ? { registrationIntent: existing ? existing.cancelled_at ? "rejoin" : "update" : "create",
          expectedUpdatedAt: existing?.updated_at ?? null } : {
          submissionId: existing?.id ?? null, expectedUpdatedAt: existing?.updated_at ?? null,
        }),
      })
      if (res.error) {
        if (res.error === "roundParticipationNotAllowed") setParticipationDenied(true)
        if (res.error === "matchingProfileIncomplete" && "missingProfiles" in res) setMissingProfiles(res.missingProfiles ?? [])
        if (["surveyExpired", "surveyClosed", "surveyNotStarted", "roundNotFound", "surveyUpdated", "surveyReadOnly", "registrationChanged"].includes(res.error)) setServerClosed(true)
        setError(tErr.has(res.error) ? tErr(res.error) : res.error)
        return
      }
      router.push(`/app/matching/survey/success?roundId=${encodeURIComponent(roundId)}${fromParticipation ? "&from=participation" : ""}`)
    } catch (error) {
      unstable_rethrow(error)
      setError(tErr("networkError"))
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 pb-4">
      <MatchingProfileDialog open={missingProfiles !== null} missing={missingProfiles ?? []}
        onCancel={() => setMissingProfiles(null)}
        onRetry={() => router.refresh()}
        onComplete={() => router.push(buildMatchingCompletionHref({ roundId, fromParticipation }))} />
      <RoundDetails roundName={roundName} purpose={purpose} config={config} surveyEnd={surveyEnd} showFormHeading={!registered} />
      {purpose !== "announcement" && <>
        <fieldset disabled={blocked || submitting || cancelling} className="space-y-6 disabled:opacity-70">
          <RoundFormFields purpose={purpose} config={config} activityStart={activityStart} activityEnd={activityEnd}
            value={value} onChange={setValue} registered={registered} />
        </fieldset>
        <SurveyActionBar onSubmit={handleSubmit} disabled={blocked || submitting || cancelling || needsTime || unchanged} submitting={submitting}
          hideSubmit={registered && config.questions.length === 0}
          error={error} notice={unavailable ? t("unavailableWhileFilling") : undefined}
          hint={!blocked && needsTime ? t("noTimeSlotHint") : undefined}
          label={submitting ? t("submitting") : existing?.cancelled_at ? t("registration.rejoin") : existing ? t(purpose === "registration" ? "registration.update" : "update")
            : localizeRoundText(config.labels.submit, locale, t(purpose === "registration" ? "registration.submit" : "submit"))}>
          {purpose === "registration" && existing && !existing.cancelled_at && <CancelRegistrationButton
            roundId={roundId} roundName={roundName} expectedUpdatedAt={existing.updated_at ?? null}
            disabled={blocked || submitting} returnToRecord onBusyChange={setCancelling} />}
        </SurveyActionBar>
      </>}
    </div>
  )
}
