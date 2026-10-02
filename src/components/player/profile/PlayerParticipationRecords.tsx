import Link from "next/link"
import { ArrowUpRight, ChevronDown, ClipboardCheck } from "lucide-react"
import { getLocale, getTranslations } from "next-intl/server"
import type { PlayerParticipationRecord } from "@/types/player-participation"
import { groupParticipationRecords } from "@/lib/matching/participation-display"
import { PlayerParticipationCard } from "./PlayerParticipationCard"
import type { ActivityReviewRound } from "@/lib/activity-reviews/types"
import { ActivityReviewEntry } from "../activity-reviews/ActivityReviewEntry"

export async function PlayerParticipationRecords({ records, initialNow, reviewRounds = [] }: { records: PlayerParticipationRecord[]; initialNow: string; reviewRounds?: ActivityReviewRound[] }) {
  const [t, locale] = await Promise.all([getTranslations("participation"), getLocale()])
  const grouped = groupParticipationRecords(records, new Date(initialNow))
  const openReviewIds = new Set(reviewRounds.filter((round) => round.canReview).map((round) => round.roundId))
  const current = [...grouped.current, ...grouped.history.filter((record) => openReviewIds.has(record.round.id))]
  const history = grouped.history.filter((record) => !openReviewIds.has(record.round.id))
  const additionalReviewRounds = reviewRounds.filter((round) => round.status !== "unavailable" && !records.some((record) => record.round.id === round.roundId))
  return <section id="participation" className="scroll-mt-24 space-y-3" aria-labelledby="participation-title">
    <div>
      <h2 id="participation-title" className="text-base font-semibold tracking-tight">{t("title")}</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("description")}</p>
    </div>
    {records.length === 0 && additionalReviewRounds.length === 0 && <div className="rounded-2xl border border-dashed border-border bg-card/50 px-4 py-6 text-center">
      <ClipboardCheck className="mx-auto mb-2 size-5 text-primary/60" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{t("empty")}</p>
    </div>}
    {additionalReviewRounds.map((round) => <ActivityReviewEntry key={round.roundId} round={round} locale={locale} showRoundTitle />)}
    {current.map((record) => <PlayerParticipationCard key={record.id} record={record} initialNow={initialNow} reviewRound={reviewRounds.find((round) => round.roundId === record.round.id)} />)}
    {history.length > 0 && <details open={current.length === 0} className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg px-1 text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
        {t("history", { count: history.length })}<ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 pt-1">{history.map((record) => <PlayerParticipationCard key={record.id} record={record} initialNow={initialNow} reviewRound={reviewRounds.find((round) => round.roundId === record.round.id)} />)}</div>
    </details>}
    <Link href="/app/matching" className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-primary/7 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {t("browseAll")}<ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
    </Link>
  </section>
}
