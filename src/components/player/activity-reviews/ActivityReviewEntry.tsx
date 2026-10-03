import Link from "next/link"
import { ArrowUpRight, MessageSquareText } from "lucide-react"
import { activityReviewCopy } from "@/lib/activity-reviews/copy"
import type { ActivityReviewRound } from "@/lib/activity-reviews/types"

export function ActivityReviewEntry({ round, locale, compact = false, showRoundTitle = false }: { round: ActivityReviewRound; locale: string; compact?: boolean; showRoundTitle?: boolean }) {
  if (round.status === "unavailable") return null
  const copy = activityReviewCopy(locale)
  const entryLabel = round.canReview ? (round.hasSubmittedFeedback ?? round.reviewedCount > 0) ? copy.continueEntry : copy.entry : copy.viewEntry
  const href = `/app/matches/rounds/${encodeURIComponent(round.roundId)}/reviews`
  if (compact) return <Link href={href} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary/10 px-3 text-xs font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
    <MessageSquareText className="size-3.5" aria-hidden="true" />{entryLabel}
  </Link>
  return <section className="space-y-3 rounded-2xl border border-primary/15 bg-primary/5 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{copy.title}</h2><span className="text-xs font-medium text-primary">{copy.state[round.status]}</span></div>
    {showRoundTitle && <h3 className="break-words text-base font-semibold leading-6">{round.title}</h3>}
    <p className="text-xs leading-5 text-muted-foreground">{copy.intro}</p>
    <p className="text-xs font-medium text-primary">{copy.reviewed(round.reviewedCount)}</p>
    <Link href={href} className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">{entryLabel}<ArrowUpRight className="size-4" aria-hidden="true" /></Link>
  </section>
}
