"use client"

import { useRef, useState } from "react"
import { AlertCircle, Check, ChevronDown, ShieldCheck } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { submitActivityReviewAction } from "@/app/app/matches/rounds/[roundId]/reviews/actions"
import { activityReviewCopy, activityReviewErrorMessage } from "@/lib/activity-reviews/copy"
import type { ActivityReportCategory, ActivityReviewActionResult, ActivityReviewParticipant, SubmitActivityReviewInput } from "@/lib/activity-reviews/types"
import { ActivityReviewScorePicker } from "./ActivityReviewScorePicker"

export type ActivityReviewAction = (input: SubmitActivityReviewInput) => Promise<ActivityReviewActionResult>
export interface ActivityReviewDraft {
  score: number | null; comment: string; category: ActivityReportCategory; detail: string; supplement: string; reportOpen: boolean
}
type SaveKind = "review" | "report" | "combined" | "supplement"
const inputClass = "w-full rounded-xl border border-border bg-background px-3 py-3 text-sm leading-6 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-60"
const buttonClass = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"

export function ActivityReviewEditor({ roundId, participant, canReview, canReport, locale,
  action = submitActivityReviewAction, onSaved, draft, onDraftChange, onBusyChange }: {
  roundId: string; participant: ActivityReviewParticipant; canReview: boolean; canReport: boolean; locale: string
  action?: ActivityReviewAction; onSaved?: (result: ActivityReviewActionResult) => void
  draft?: ActivityReviewDraft; onDraftChange?: (draft: ActivityReviewDraft) => void; onBusyChange?: (busy: boolean) => void
}) {
  const copy = activityReviewCopy(locale)
  const [review, setReview] = useState(participant.review)
  const [report, setReport] = useState(participant.report)
  const [score, setScore] = useState<number | null>(draft ? draft.score : participant.review?.score ?? null)
  const [comment, setComment] = useState(draft?.comment ?? participant.review?.comment ?? "")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(draft?.reportOpen ?? false)
  const [category, setCategory] = useState<ActivityReportCategory>(draft?.category ?? "other")
  const [detail, setDetail] = useState(draft?.detail ?? "")
  const [supplement, setSupplement] = useState(draft?.supplement ?? "")
  const [busy, setBusy] = useState<SaveKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const inFlight = useRef(false)
  const retry = useRef<{ signature: string; requestId: string } | null>(null)
  const reportDetailRef = useRef<HTMLTextAreaElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)

  function persistDraft(change: Partial<ActivityReviewDraft>) {
    onDraftChange?.({ score, comment, category, detail, supplement, reportOpen, ...change })
  }
  function showError(message: string) {
    setError(message)
    requestAnimationFrame(() => {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      errorRef.current?.focus({ preventScroll: true })
    })
  }
  function toggleReport() {
    if (report || reportOpen) { setReportOpen(!reportOpen); persistDraft({ reportOpen: !reportOpen }) }
    else setConfirmOpen(true)
  }

  async function save(kind: SaveKind) {
    if (inFlight.current) return
    const includesReview = kind === "review" || kind === "combined"
    const includesReport = kind !== "review"
    if ((includesReview && (!canReview || review?.valid === false)) || (includesReport && !canReport)) return
    setError(null); setSuccess(null)
    if (kind === "supplement" && report && report.supplements.length >= 50) { showError(copy.reportSupplementLimit); return }
    if (includesReview && (score === null || score < 1 || score > 5 || !Number.isInteger(score * 2))) { showError(copy.errors.score); return }
    if (includesReview && Array.from(comment.trim()).length > 500) { showError(copy.errors.comment); return }
    const reportDetail = (kind === "supplement" ? supplement : detail).trim()
    if (includesReport && (Array.from(reportDetail).length < 10 || Array.from(reportDetail).length > 2000)) { showError(copy.errors.report); return }
    const input: SubmitActivityReviewInput = {
      operation: kind === "supplement" ? "append_report" : "save", roundId, targetMemberId: participant.memberId,
      ...(includesReview ? { review: { score: score!, comment: comment.trim(), expectedVersion: review?.version ?? 0 } } : {}),
      ...(includesReport ? { report: { category: report?.category ?? category, detail: reportDetail, expectedVersion: report?.version ?? 0 } } : {}),
    }
    const signature = JSON.stringify(input)
    if (!retry.current || retry.current.signature !== signature) retry.current = { signature, requestId: crypto.randomUUID() }
    input.requestId = retry.current.requestId
    inFlight.current = true; setBusy(kind); onBusyChange?.(true)
    try {
      const result = await action(input)
      if (!result.success || result.error) { showError(activityReviewErrorMessage(result.error, locale)); return }
      retry.current = null
      if (result.review) { setReview(result.review); setScore(result.review.score); setComment(result.review.comment) }
      if (result.report) { setReport(result.report); setDetail(""); setSupplement(""); setReportOpen(true) }
      persistDraft({ ...(result.review ? { score: result.review.score, comment: result.review.comment } : {}), ...(result.report ? { detail: "", supplement: "", reportOpen: true } : {}) })
      setSuccess(kind === "supplement" ? copy.reportSupplementSaved : includesReport ? copy.reportSubmitted : review ? copy.updated : copy.saved)
      onSaved?.(result)
    } catch { showError(copy.errors.network) }
    finally { inFlight.current = false; setBusy(null); onBusyChange?.(false) }
  }

  function confirmReport() {
    setConfirmOpen(false); setReportOpen(true); persistDraft({ reportOpen: true })
    requestAnimationFrame(() => reportDetailRef.current?.focus())
  }

  return <section id="activity-review-editor" aria-labelledby="activity-review-editor-title" className="scroll-mt-6 space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-5">
    <header className="border-b border-border pb-4">
      <p className="text-[11px] font-semibold tracking-wide text-primary">{copy.selected}</p>
      <h2 id="activity-review-editor-title" tabIndex={-1} className="mt-1 break-words text-lg font-semibold outline-none">{participant.fullName || copy.unnamed}</h2>
      <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{participant.nickname ? `${copy.nickname} · ${participant.nickname}` : copy.noNickname}</p>
    </header>

    <ActivityReviewScorePicker value={score} onChange={(value) => { setScore(value); persistDraft({ score: value }) }} disabled={!canReview || review?.valid === false || Boolean(busy)} copy={copy} />
    <div className="space-y-2">
      <label htmlFor="activity-review-comment" className="flex items-center justify-between gap-3 text-sm font-semibold">{copy.comment}<span className="text-xs font-normal text-muted-foreground">{copy.optional}</span></label>
      <textarea id="activity-review-comment" value={comment} onChange={(event) => { setComment(event.target.value); persistDraft({ comment: event.target.value }) }} disabled={!canReview || review?.valid === false || Boolean(busy)} maxLength={1000} rows={4} placeholder={copy.commentPlaceholder} className={inputClass} />
      <p className={`text-right text-[11px] tabular-nums ${Array.from(comment).length > 500 ? "text-destructive" : "text-muted-foreground"}`}>{Array.from(comment).length} / 500</p>
    </div>
    {review && <p className="text-[11px] leading-5 text-muted-foreground">{copy.version(review.version)} · {copy.lastSaved} {formatActivityReviewTime(review.updatedAt, locale)}</p>}
    <p className="text-xs leading-5 text-muted-foreground">{review?.valid === false ? copy.invalidatedHint : canReview ? copy.editingHint : copy.closedHint}</p>
    {canReview && review?.valid !== false && <button type="button" onClick={() => save("review")} disabled={Boolean(busy) || score === null || Array.from(comment.trim()).length > 500} aria-busy={busy === "review"} className={`${buttonClass} w-full bg-primary text-primary-foreground`}>
      {busy === "review" ? copy.saving : review ? copy.update : copy.save}
    </button>}

    <div className="space-y-3 border-t border-border pt-4">
      <button type="button" disabled={Boolean(busy) || (!canReport && !report)} onClick={toggleReport}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left text-sm font-medium text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-50" aria-expanded={reportOpen}>
        <span className="flex items-center gap-2"><AlertCircle className="size-4 shrink-0" aria-hidden="true" />{report ? copy.reportView : reportOpen ? copy.reportHide : copy.report}</span><ChevronDown className={`size-4 shrink-0 transition-transform ${reportOpen ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <p className="text-xs leading-5 text-muted-foreground">{copy.reportHelp}</p>
      {reportOpen && <div className="space-y-4 rounded-xl border border-destructive/15 bg-destructive/[0.025] p-3 sm:p-4">
        <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{copy.reportPrivate}</p>
        {report ? <>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{copy.reportHistory}</h3>
            <p className="text-xs text-muted-foreground">{copy.reportStatus} · {copy.reportStates[report.status]} · {formatActivityReviewTime(report.createdAt, locale)}</p>
            <p className="text-sm font-medium">{copy.categories[report.category]}</p>
            <p className="whitespace-pre-wrap break-words text-sm leading-6">{report.detail}</p>
          </div>
          {report.supplements.length > 0 && <div className="space-y-3 border-t border-destructive/10 pt-3">
            <h4 className="text-xs font-semibold">{copy.reportSupplements}</h4>
            {report.supplements.map((item, index) => <div key={`${item.createdAt}:${index}`} className="space-y-1"><p className="text-[11px] text-muted-foreground">{formatActivityReviewTime(item.createdAt, locale)}</p><p className="whitespace-pre-wrap break-words text-sm leading-6">{item.detail}</p></div>)}
          </div>}
          <p className="text-xs leading-5 text-muted-foreground">{copy.reportReadOnly}</p>
          {canReport && report.supplements.length < 50 ? <>
            <label htmlFor="activity-report-supplement" className="block text-sm font-semibold">{copy.reportSupplement}</label>
            <textarea id="activity-report-supplement" value={supplement} onChange={(event) => { setSupplement(event.target.value); persistDraft({ supplement: event.target.value }) }} disabled={Boolean(busy)} maxLength={4000} rows={4} placeholder={copy.reportSupplementPlaceholder} className={inputClass} />
            <p className="text-right text-[11px] text-muted-foreground">{Array.from(supplement).length} / 2000</p>
            <button type="button" onClick={() => save("supplement")} disabled={Boolean(busy) || Array.from(supplement.trim()).length < 10 || Array.from(supplement.trim()).length > 2000} aria-busy={busy === "supplement"} className={`${buttonClass} w-full border border-destructive/25 bg-background text-destructive`}>{busy === "supplement" ? copy.reportSubmitting : copy.reportSupplementSubmit}</button>
          </> : <p className="text-xs leading-5 text-muted-foreground">{report.supplements.length >= 50 ? copy.reportSupplementLimit : copy.reportUnavailable}</p>}
        </> : <>
          <div className="space-y-2"><label htmlFor="activity-report-category" className="block text-sm font-semibold">{copy.reportCategory}</label>
            <select id="activity-report-category" value={category} onChange={(event) => { setCategory(event.target.value as ActivityReportCategory); persistDraft({ category: event.target.value as ActivityReportCategory }) }} disabled={Boolean(busy)} className={inputClass}>
              {(Object.keys(copy.categories) as ActivityReportCategory[]).map((key) => <option key={key} value={key}>{copy.categories[key]}</option>)}
            </select></div>
          <div className="space-y-2"><label htmlFor="activity-report-detail" className="block text-sm font-semibold">{copy.reportDetail}</label>
            <textarea id="activity-report-detail" ref={reportDetailRef} value={detail} onChange={(event) => { setDetail(event.target.value); persistDraft({ detail: event.target.value }) }} disabled={Boolean(busy)} maxLength={4000} rows={5} placeholder={copy.reportPlaceholder} className={inputClass} />
            <p className="text-right text-[11px] text-muted-foreground">{Array.from(detail).length} / 2000</p></div>
          {canReview && review?.valid !== false && score !== null && <button type="button" onClick={() => save("combined")} disabled={Boolean(busy) || !canReport || Array.from(detail.trim()).length < 10 || Array.from(detail.trim()).length > 2000 || Array.from(comment.trim()).length > 500} aria-busy={busy === "combined"} className={`${buttonClass} w-full bg-primary text-primary-foreground`}>{busy === "combined" ? copy.reportSubmitting : copy.reportCombined}</button>}
          <button type="button" onClick={() => save("report")} disabled={Boolean(busy) || !canReport || Array.from(detail.trim()).length < 10 || Array.from(detail.trim()).length > 2000} aria-busy={busy === "report"} className={`${buttonClass} w-full border border-destructive/25 bg-background text-destructive`}>{busy === "report" ? copy.reportSubmitting : copy.reportSubmit}</button>
          <p className="text-xs leading-5 text-muted-foreground">{copy.reportOnlyHint}</p>
        </>}
      </div>}
    </div>
    {error && <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-xl bg-destructive/5 p-3 text-sm leading-6 text-destructive outline-none focus-visible:ring-2 focus-visible:ring-destructive">{error}</p>}
    {success && <p role="status" className="flex items-start gap-2 rounded-xl bg-primary/7 p-3 text-sm leading-6 text-primary"><Check className="mt-1 size-4 shrink-0" aria-hidden="true" />{success}</p>}

    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogContent showCloseButton={false} className="rounded-2xl p-5">
        <DialogTitle className="text-base font-semibold leading-6">{copy.reportTitle}</DialogTitle>
        <p className="break-words text-sm font-semibold">{participant.fullName || copy.unnamed}{participant.nickname ? ` · ${participant.nickname}` : ""}</p>
        <DialogDescription className="leading-6">{copy.reportConfirmDescription}</DialogDescription>
        <div className="grid grid-cols-1 gap-2">
          <button type="button" onClick={confirmReport} className={`${buttonClass} bg-destructive text-white`}>{copy.reportConfirm}</button>
          <button type="button" onClick={() => setConfirmOpen(false)} className={`${buttonClass} border border-border bg-background`}>{copy.cancel}</button>
        </div>
      </DialogContent>
    </Dialog>
  </section>
}

export function formatActivityReviewTime(value: string, locale: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "—"
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "zh-CN", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date)
}
