import { ChevronDown } from "lucide-react"
import { activityReviewCopy } from "@/lib/activity-reviews/copy"
import type { ActivityReport, ActivityReview } from "@/lib/activity-reviews/types"
import { formatActivityReviewTime } from "./ActivityReviewEditor"

/** Only the author's records enter this section. Identity fields are deliberately absent. */
export function ActivityReviewHistory({ reviews, reports, locale, open = false }: {
  reviews: ActivityReview[]; reports: ActivityReport[]; locale: string; open?: boolean
}) {
  const copy = activityReviewCopy(locale)
  const records = new Map<string, { review?: ActivityReview; report?: ActivityReport }>()
  for (const review of reviews) records.set(review.revieweeId, { ...records.get(review.revieweeId), review })
  for (const report of reports) records.set(report.revieweeId, { ...records.get(report.revieweeId), report })
  if (!records.size) return null
  return <details open={open} className="group rounded-2xl border border-border bg-card" data-testid="activity-review-history">
    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
      <span className="text-sm font-semibold">{copy.historyTitle}<span className="ml-2 text-xs font-normal text-muted-foreground">{copy.historyCount(records.size)}</span></span><ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div className="space-y-4 border-t border-border p-4">
      <p className="text-xs leading-5 text-muted-foreground">{copy.historyHint}</p>
      {[...records.entries()].map(([memberId, { review, report }]) => <article key={memberId} className="space-y-3 rounded-xl border border-border bg-background p-3">
        <h3 className="break-words text-sm font-semibold">{copy.historyTarget(memberId.slice(0, 8))}</h3>
        {review && <div className="space-y-1.5">
          <p className="text-sm font-semibold text-primary">{copy.scoreLabel(review.score)}</p>
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{review.comment || copy.noComment}</p>
          <p className="text-[11px] leading-5 text-muted-foreground">{copy.version(review.version)} · {formatActivityReviewTime(review.updatedAt, locale)}</p>
          {!review.valid && <p className="text-xs leading-5 text-muted-foreground">{copy.invalidatedHint}</p>}
        </div>}
        {report && <div className="space-y-2 border-t border-border pt-3">
          <h4 className="text-xs font-semibold">{copy.reportHistory} · {copy.reportStates[report.status]}</h4>
          <p className="text-xs text-muted-foreground">{copy.categories[report.category]} · {formatActivityReviewTime(report.createdAt, locale)}</p>
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{report.detail}</p>
          {report.supplements.length > 0 && <div className="space-y-2 border-l-2 border-border pl-3"><h5 className="text-xs font-semibold">{copy.reportSupplements}</h5>{report.supplements.map((item, index) => <div key={`${item.createdAt}:${index}`}><p className="text-[11px] text-muted-foreground">{formatActivityReviewTime(item.createdAt, locale)}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{item.detail}</p></div>)}</div>}
        </div>}
      </article>)}
    </div>
  </details>
}
