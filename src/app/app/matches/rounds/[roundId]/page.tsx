import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { getLocale, getTranslations } from "next-intl/server"
import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerParticipationDetail } from "@/lib/queries/player-participation"
import { getRoundPurpose, normalizeRoundConfig } from "@/lib/matching/round-config"
import { formatSurveyTime } from "@/lib/matching/survey-window"
import { RoundDetails } from "@/components/player/RoundDetails"
import { ParticipationAnswers } from "@/components/player/profile/ParticipationAnswers"
import { ParticipationRecordActions } from "@/components/player/profile/ParticipationRecordActions"

export default async function ParticipationRecordPage({ params }: { params: Promise<{ roundId: string }> }) {
  const player = await requirePlayer()
  const { roundId } = await params
  const [record, t, locale] = await Promise.all([
    fetchPlayerParticipationDetail(player.memberId, roundId),
    getTranslations("participation"),
    getLocale(),
  ])
  if (!record) notFound()
  const { round } = record
  return <div className="space-y-5 px-4 pb-7 pt-3">
    <Link href="/app/matches#participation" className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <ArrowLeft className="size-4" aria-hidden="true" />{t("backToRecords")}
    </Link>
    <RoundDetails roundName={round.round_name} purpose={getRoundPurpose(round.purpose)} config={normalizeRoundConfig(round.content_config)} surveyEnd={round.survey_end} showFormHeading={false} />
    <ParticipationRecordActions key={`${record.id}:${record.updated_at}`} round={round} initialNow={new Date().toISOString()}
      cancelledAt={record.cancelled_at} updatedAt={record.updated_at} />
    <ParticipationAnswers record={record} />
    {(record.created_at || record.updated_at) && <div className="space-y-1 text-xs leading-5 text-muted-foreground">
      {record.cancelled_at && <p>{t("cancelledAt", { time: formatSurveyTime(record.cancelled_at, locale) })}</p>}
      {record.created_at && <p>{t("submittedAt", { time: formatSurveyTime(record.created_at, locale) })}</p>}
      {record.updated_at && record.updated_at !== record.created_at && <p>{t("updatedAt", { time: formatSurveyTime(record.updated_at, locale) })}</p>}
    </div>}
  </div>
}
