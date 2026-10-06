"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Search, Users } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { activityReviewCopy } from "@/lib/activity-reviews/copy"
import type { ActivityReviewActionResult, ActivityReviewContext } from "@/lib/activity-reviews/types"
import { ActivityReviewEditor, formatActivityReviewTime, type ActivityReviewAction, type ActivityReviewDraft } from "./ActivityReviewEditor"
import { ActivityReviewHistory } from "./ActivityReviewHistory"

export function ActivityReviewPageContent({ context, locale, action, initialSelectedMemberId = null }: {
  context: ActivityReviewContext; locale: string; action?: ActivityReviewAction; initialSelectedMemberId?: string | null
}) {
  const copy = activityReviewCopy(locale)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedMemberId)
  const [updates, setUpdates] = useState<Record<string, ActivityReviewActionResult>>({})
  const [drafts, setDrafts] = useState<Record<string, ActivityReviewDraft>>({})
  const [editorBusy, setEditorBusy] = useState(false)
  const [historySelection, setHistorySelection] = useState<{ memberId: string; kind: "review" | "report" } | null>(null)
  const [historySuccess, setHistorySuccess] = useState<string | null>(null)
  const participants = context.participants.map((participant) => ({ ...participant, review: updates[participant.memberId]?.review ?? participant.review, report: updates[participant.memberId]?.report ?? participant.report }))
  const selected = participants.find((participant) => participant.memberId === selectedId)
  const ownReviews = new Map((context.ownReviews ?? context.participants.flatMap((participant) => participant.review ? [participant.review] : [])).map((review) => [review.revieweeId, review]))
  const ownReports = new Map((context.ownReports ?? context.participants.flatMap((participant) => participant.report ? [participant.report] : [])).map((report) => [report.revieweeId, report]))
  for (const [memberId, result] of Object.entries(updates)) {
    if (result.review) ownReviews.set(memberId, result.review)
    if (result.report) ownReports.set(memberId, result.report)
  }
  const targetById = new Map(context.participants.map((participant) => [participant.memberId, { memberId: participant.memberId, fullName: participant.fullName, nickname: participant.nickname, canReview: context.canReview, canReport: context.canReport }]))
  for (const target of context.historyTargets ?? []) targetById.set(target.memberId, target)
  const historyTargets = context.eligible ? [...targetById.values()].map((target) => ({ ...target, canReview: target.canReview && context.canReview, canReport: target.canReport && context.canReport })) : []
  const historyTarget = historyTargets.find((target) => target.memberId === historySelection?.memberId)
  const historyParticipant = historyTarget ? { ...historyTarget, review: ownReviews.get(historyTarget.memberId) ?? null, report: ownReports.get(historyTarget.memberId) ?? null } : null
  const originalReviews = new Set((context.ownReviews ?? context.participants.flatMap((participant) => participant.review ? [participant.review] : [])).map((review) => review.revieweeId))
  const reviewedCount = context.reviewedCount + Object.entries(updates).filter(([memberId, result]) => result.review && !originalReviews.has(memberId)).length
  const baseHref = `/app/matches/rounds/${encodeURIComponent(context.roundId)}/reviews`
  const pages = Math.max(1, Math.ceil(context.total / context.pageSize))
  function pageHref(page: number) {
    const params = new URLSearchParams({ page: String(page) })
    if (context.search) params.set("search", context.search)
    return `${baseHref}?${params}`
  }
  function selectParticipant(memberId: string) {
    if (editorBusy) return
    setSelectedId(memberId)
    requestAnimationFrame(() => {
      document.getElementById("activity-review-editor")?.scrollIntoView({ behavior: "smooth", block: "start" })
      document.getElementById("activity-review-editor-title")?.focus({ preventScroll: true })
    })
  }
  function saveResult(memberId: string, result: ActivityReviewActionResult) {
    setUpdates((previous) => ({ ...previous, [memberId]: { ...previous[memberId], ...(result.review ? { review: result.review } : {}), ...(result.report ? { report: result.report } : {}) } }))
    setDrafts((previous) => {
      const draft = previous[memberId]
      if (!draft) return previous
      return { ...previous, [memberId]: { ...draft, ...(result.review ? { score: result.review.score, comment: result.review.comment } : {}), ...(result.report ? { category: result.report.category, detail: result.report.detail, supplement: "" } : {}) } }
    })
  }
  function editHistory(memberId: string, kind: "review" | "report") {
    if (editorBusy) return
    const target = historyTargets.find((item) => item.memberId === memberId)
    if (!target || (kind === "review" ? !target.canReview || !ownReviews.get(memberId)?.valid : !target.canReport || !ownReports.has(memberId))) return
    setHistorySuccess(null)
    setHistorySelection({ memberId, kind })
  }
  function closeHistory() {
    if (!editorBusy) setHistorySelection(null)
  }

  return <div className="mx-auto max-w-2xl space-y-5 px-4 pb-8 pt-3">
    <Link href="/app/matches#participation" className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ArrowLeft className="size-4" aria-hidden="true" />{copy.back}</Link>
    <header className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-primary">{copy.title}</p><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${context.status === "open" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{copy.state[context.status]}</span></div>
      <h1 className="heading-display break-words text-2xl font-semibold leading-8">{context.title || copy.title}</h1>
      <p className="text-sm leading-6 text-muted-foreground">{copy.intro}</p>
      <div className="space-y-1 text-xs leading-5 text-muted-foreground">
        {context.opensAt && <p>{copy.opensAt} · {formatActivityReviewTime(context.opensAt, locale)}</p>}
        {context.closesAt && <p>{copy.closesAt} · {formatActivityReviewTime(context.closesAt, locale)}</p>}
      </div>
    </header>
    <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-primary"><Check className="size-4" aria-hidden="true" />{copy.reviewed(reviewedCount)}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{copy.privacy}</p>
    </div>
    {!context.eligible || context.status === "unavailable" ? <p role="status" className="rounded-2xl border border-dashed border-border p-5 text-sm leading-6 text-muted-foreground">{copy.unavailableHint}</p> : <>
      {!context.canReview && <p role="status" className="rounded-xl bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">{copy.closedHint}</p>}
      <section aria-labelledby="activity-review-participants" className="space-y-3">
        <div className="flex items-center justify-between gap-2"><h2 id="activity-review-participants" className="text-base font-semibold">{copy.select}</h2><span className="text-xs text-muted-foreground">{copy.participants(context.participantCount)}</span></div>
        <form action={baseHref} method="get" className="space-y-2" role="search">
          <label htmlFor="activity-review-search" className="sr-only">{copy.search}</label>
          <div className="flex gap-2"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true" /><input id="activity-review-search" name="search" defaultValue={context.search} maxLength={80} placeholder={copy.searchPlaceholder} className="min-h-11 w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" /></div><button type="submit" className="min-h-11 shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">{copy.searchButton}</button></div>
          {context.search && <Link href={baseHref} className="inline-flex min-h-11 items-center text-xs font-medium text-primary underline underline-offset-4">{copy.clear}</Link>}
        </form>
        {participants.length ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {participants.map((participant) => <button key={participant.memberId} type="button" onClick={() => selectParticipant(participant.memberId)} aria-pressed={selectedId === participant.memberId} disabled={editorBusy}
            className={`flex min-h-20 min-w-0 items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-60 ${selectedId === participant.memberId ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:border-primary/40"}`}>
            <span className="min-w-0 space-y-1"><span className="block break-words text-sm font-semibold">{participant.fullName || copy.unnamed}</span><span className="block break-words text-xs leading-5 text-muted-foreground">{participant.nickname ? `${copy.nickname} · ${participant.nickname}` : copy.noNickname}</span>{participant.report && <span className="block text-[11px] text-muted-foreground">{copy.reportedBadge}</span>}</span>
            <span className="flex shrink-0 flex-col items-end gap-1"><span className={`rounded-full px-2 py-1 text-[10px] font-medium ${participant.review ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{participant.review ? copy.reviewedBadge : copy.unreviewed}</span>{participant.review && <span className="text-xs font-semibold tabular-nums text-primary">{copy.scoreLabel(participant.review.score)}</span>}</span>
          </button>)}
        </div> : <div className="space-y-2 rounded-xl border border-dashed border-border p-5 text-center"><Users className="mx-auto size-5 text-primary/60" aria-hidden="true" /><p className="text-sm font-medium">{copy.empty}</p><p className="text-xs leading-5 text-muted-foreground">{copy.emptyHint}</p></div>}
        {pages > 1 && <nav aria-label={copy.select} className="flex items-center justify-between gap-2 pt-1">
          {context.page > 1 ? <Link href={pageHref(context.page - 1)} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-primary"><ChevronLeft className="size-4" aria-hidden="true" />{copy.previous}</Link> : <span />}
          <span className="text-[11px] tabular-nums text-muted-foreground">{copy.page(context.page, pages)}</span>
          {context.page < pages ? <Link href={pageHref(context.page + 1)} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-primary">{copy.next}<ChevronRight className="size-4" aria-hidden="true" /></Link> : <span />}
        </nav>}
      </section>
      {!historySelection && (selected ? <ActivityReviewEditor key={selected.memberId} roundId={context.roundId} participant={selected} canReview={context.canReview} canReport={context.canReport} locale={locale} action={action}
        draft={drafts[selected.memberId]} onDraftChange={(draft) => setDrafts((previous) => ({ ...previous, [selected.memberId]: draft }))} onBusyChange={setEditorBusy}
        onSaved={(result) => saveResult(selected.memberId, result)} />
        : participants.length > 0 && <div className="space-y-2 rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-center"><p className="text-sm font-medium">{copy.choose}</p><p className="text-xs leading-5 text-muted-foreground">{copy.chooseHint}</p></div>)}
    </>}
    {historySuccess && <p role="status" className="rounded-xl bg-primary/7 px-4 py-3 text-sm text-primary">{historySuccess}</p>}
    <ActivityReviewHistory reviews={[...ownReviews.values()]} reports={[...ownReports.values()]} targets={historyTargets} locale={locale} open={!context.eligible} busy={editorBusy} onEdit={editHistory} />
    <Dialog open={Boolean(historySelection && historyParticipant)} onOpenChange={(open) => { if (!open) closeHistory() }}>
      <DialogContent showCloseButton={false} className="max-h-[85dvh] overflow-y-auto rounded-2xl p-5 sm:max-w-lg">
        <DialogTitle className="text-base font-semibold">{historySelection?.kind === "review" ? copy.editReview : historyParticipant?.report?.status === "pending" ? copy.editReport : copy.reportCorrect}</DialogTitle>
        <DialogDescription className="break-words text-sm">{historyParticipant?.fullName || copy.historyUnavailable}{historyParticipant?.nickname ? ` · ${historyParticipant.nickname}` : ""}</DialogDescription>
        {historySelection && historyParticipant && <ActivityReviewEditor key={`${historySelection.memberId}:${historySelection.kind}`} roundId={context.roundId} participant={historyParticipant}
          canReview={historyTarget?.canReview ?? false} canReport={historyTarget?.canReport ?? false} locale={locale} action={action} mode={historySelection.kind} onBusyChange={setEditorBusy} onCancel={closeHistory}
          onSaved={(result) => {
            saveResult(historySelection.memberId, result)
            setHistorySuccess(result.report ? !historyParticipant.report ? copy.reportSubmitted : historyParticipant.report.status === "pending" ? copy.reportUpdated : copy.reportSupplementSaved : copy.updated)
            // A report-only save must leave an unsaved score/comment available.
            if (historySelection.kind === "review" && !result.review && result.report) return
            setHistorySelection(null)
          }} />}
      </DialogContent>
    </Dialog>
  </div>
}
