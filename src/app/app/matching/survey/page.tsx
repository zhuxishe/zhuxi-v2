import { requirePlayer } from "@/lib/auth/player"
import { fetchOpenRound, fetchLatestRound, fetchMySubmission } from "@/lib/queries/rounds"
import { getTranslations } from "next-intl/server"
import { SurveyForm } from "@/components/player/SurveyForm"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getSurveyWindowState } from "@/lib/matching/survey-window"
import { fetchPlayerRound } from "@/lib/queries/player-rounds"
import { getRoundPurpose, normalizeRoundConfig } from "@/lib/matching/round-config"
import type { RoundRecord } from "@/types/matching-round"

function BackLink({ label }: { label: string }) {
  return (
    <Link href="/app" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground">
      <ArrowLeft className="size-4" /> {label}
    </Link>
  )
}

function StatusMessage({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="text-center py-20">
      <p className="text-muted-foreground">{text}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  )
}

export default async function SurveyPage({ searchParams }: { searchParams: Promise<{ round?: string }> }) {
  const player = await requirePlayer()
  const params = await searchParams
  const round: RoundRecord | null = params.round ? await fetchPlayerRound(params.round) : await fetchOpenRound()
  const t = await getTranslations("survey")

  if (!round || getSurveyWindowState(round) !== "open") {
    const latest = round ?? (params.round ? null : await fetchLatestRound())
    let statusText = t("noRound")
    let statusHint = t("noRoundHint")

    if (latest) {
      const state = getSurveyWindowState(latest)
      if (state === "draft" || state === "scheduled") {
        statusText = t("roundDraft")
        statusHint = t("roundDraftHint")
      } else {
        statusText = t("roundClosed")
        statusHint = t("roundClosedHint")
      }
    }

    return (
      <div className="px-4 py-6">
        <BackLink label={t("backToHome")} />
        <StatusMessage text={statusText} hint={statusHint} />
      </div>
    )
  }

  const existing = await fetchMySubmission(round.id, player.memberId)

  return (
    <div className="px-4 py-6">
      <BackLink label={t("backToHome")} />
      <SurveyForm
        key={round.id}
        roundId={round.id}
        roundName={round.round_name}
        surveyStart={round.survey_start}
        surveyEnd={round.survey_end}
        initialNow={new Date().toISOString()}
        activityStart={round.activity_start}
        activityEnd={round.activity_end}
        purpose={getRoundPurpose(round.purpose)}
        config={normalizeRoundConfig(round.content_config)}
        configRevision={round.config_revision ?? 0}
        existing={existing ? {
          game_type_pref: existing.game_type_pref,
          gender_pref: existing.gender_pref,
          availability: existing.availability as Record<string, string[]>,
          interest_tags: existing.interest_tags ?? [],
          social_style: existing.social_style,
          message: existing.message,
          custom_answers: existing.custom_answers as Record<string, string | string[]> | undefined,
        } : null}
      />
    </div>
  )
}
