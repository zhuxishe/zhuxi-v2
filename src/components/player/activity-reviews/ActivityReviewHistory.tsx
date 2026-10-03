import { ChevronDown } from "lucide-react"
import { activityReviewCopy } from "@/lib/activity-reviews/copy"
import type { ActivityReport, ActivityReview, ActivityReviewHistoryTarget } from "@/lib/activity-reviews/types"
import { formatActivityReviewTime } from "./ActivityReviewEditor"

/** Target labels and editing permissions are scoped to the current viewer by the server. */
export function ActivityReviewHistory({ reviews, reports, targets = [], locale, open = false, busy = false, onEdit }: {
  reviews: ActivityReview[]; reports: ActivityReport[]; targets?: ActivityReviewHistoryTarget[]; locale: string; open?: boolean; busy?: boolean
  onEdit?: (memberId: string, kind: "review" | "report") => void
}) {
  const copy = activityReviewCopy(locale)
  const records = new Map<string, { review?: ActivityReview; report?: ActivityReport }>()
  for (const review of reviews) records.set(review.revieweeId, { ...records.get(review.revieweeId), review })
  for (const report of reports) records.set(report.revieweeId, { ...records.get(report.revieweeId), report })
  const targetById = new Map(targets.map((target) => [target.memberId, target]))
  if (!records.size) return null
  return <details open={open} className="group rounded-2xl border border-border bg-card" data-testid="activity-review-history">
    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
      <span className="text-sm font-semibold">{copy.historyTitle}<span className="ml-2 text-xs font-normal text-muted-foreground">{copy.historyCount(records.size)}</span></span><ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div className="space-y-4 border-t border-border p-4">
      {[...records.entries()].map(([memberId, { review, report }]) => {
        const target = targetById.get(memberId)
        return <article key={memberId} className="space-y-3 rounded-xl border border-border bg-background p-3">
        <div className="space-y-1"><h3 className="break-words text-sm font-semibold">{target?.fullName || copy.historyUnavailable}</h3>{target?.nickname && <p className="break-words text-xs text-muted-foreground">{copy.nickname} · {target.nickname}</p>}</div>
        {review && <div className="space-y-1.5">
          <p className="text-sm font-semibold text-primary">{copy.scoreLabel(review.score)}</p>
          {review.comment && <p className="whitespace-pre-wrap break-words text-sm leading-6">{review.comment}</p>}
          <p className="text-[11px] leading-5 text-muted-foreground">{copy.lastSaved} {formatActivityReviewTime(review.updatedAt, locale)}</p>
          {!review.valid && <p className="text-xs leading-5 text-muted-foreground">{copy.invalidatedHint}</p>}
          {onEdit && target?.canReview && review.valid && <button type="button" onClick={() => onEdit(memberId, "review")} disabled={busy} className="-ml-2 inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">{copy.editReview}</button>}
        </div>}
        {report && <div className="space-y-2 border-t border-border pt-3">
          <h4 className="text-xs font-semibold">{copy.reportHistory} · {copy.reportStates[report.status]}</h4>
          <p className="text-xs text-muted-foreground">{copy.categories[report.category]} · {copy.lastSaved} {formatActivityReviewTime(report.updatedAt, locale)}</p>
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{report.detail}</p>
          {report.supplements.length > 0 && <div className="space-y-2 border-l-2 border-border pl-3"><h5 className="text-xs font-semibold">{copy.reportSupplements}</h5>{report.supplements.map((item, index) => <div key={`${item.createdAt}:${index}`}><p className="text-[11px] text-muted-foreground">{formatActivityReviewTime(item.createdAt, locale)}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{item.detail}</p></div>)}</div>}
          {onEdit && target?.canReport && (report.status === "pending" || report.supplements.length < 50) && <button type="button" onClick={() => onEdit(memberId, "report")} disabled={busy} className="-ml-2 inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-50">{report.status === "pending" ? copy.editReport : copy.reportCorrect}</button>}
        </div>}
      </article>})}
    </div>
  </details>
}
