import { requirePlayer } from "@/lib/auth/player"
import { fetchOpenRound, fetchLatestRound, fetchMySubmission } from "@/lib/queries/rounds"
import { getTranslations } from "next-intl/server"
import { SurveyForm } from "@/components/player/SurveyForm"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

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

export default async function SurveyPage() {
  const player = await requirePlayer()
  const round = await fetchOpenRound()
  const t = await getTranslations("survey")

  if (!round) {
    const latest = await fetchLatestRound()
    let statusText = t("noRound")
    let statusHint = t("noRoundHint")

    if (latest) {
      const expired = latest.survey_end && new Date(latest.survey_end) < new Date()
      if (latest.status === "draft") {
        statusText = t("roundDraft")
        statusHint = t("roundDraftHint")
      } else if (latest.status === "closed" || expired) {
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
        roundId={round.id}
        roundName={round.round_name}
        activityStart={round.activity_start}
        activityEnd={round.activity_end}
        existing={existing ? {
          game_type_pref: existing.game_type_pref,
          gender_pref: existing.gender_pref,
          availability: existing.availability as Record<string, string[]>,
          interest_tags: existing.interest_tags ?? [],
          social_style: existing.social_style,
          message: existing.message,
        } : null}
      />
    </div>
  )
}
