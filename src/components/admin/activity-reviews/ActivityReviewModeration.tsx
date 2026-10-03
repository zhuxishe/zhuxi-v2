"use client"

import { useState } from "react"
import { Search, ShieldAlert, Star } from "lucide-react"
import type { ActivityReport, ActivityReview, ActivityReviewActionResult, AdminActivityReviewContext, AdminActivityReviewsData, ModerateActivityReportInput, ModerateActivityReviewInput } from "@/lib/activity-reviews/types"
import { formatAdminDateTime } from "@/lib/admin-datetime"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import { AuditReasonField, fieldClass, MutationFeedback, primaryButtonClass, REPORT_CATEGORY_LABELS, ReviewHistory, secondaryButtonClass, useAdminReviewMutation } from "./shared"
import { confirmActivityReviewNavigation, useUnsavedActivityReviews } from "./use-unsaved-activity-reviews"

export const REPORT_STATUS_LABELS = { pending: "待处理", reviewing: "核查中", resolved: "已处理", dismissed: "已驳回" } as const
const PAGE_SIZE = 10
type Members = AdminActivityReviewsData["memberOptions"]
type NameMap = Map<string, Members[number]>

export function ActivityReviewModeration({ context, memberOptions, memberFilter, moderateReviewAction, moderateReportAction, onSaved }: {
  context: AdminActivityReviewContext
  memberOptions: Members
  memberFilter: string | null
  moderateReviewAction: (input: ModerateActivityReviewInput) => Promise<ActivityReviewActionResult>
  moderateReportAction: (input: ModerateActivityReportInput) => Promise<ActivityReviewActionResult>
  onSaved?: () => void
}) {
  const [query, setQuery] = useState("")
  const [queryDraft, setQueryDraft] = useState("")
  const [validity, setValidity] = useState("all")
  const [reviewPage, setReviewPage] = useState(1)
  const [reportStatus, setReportStatus] = useState("all")
  const [reportQuery, setReportQuery] = useState("")
  const [reportQueryDraft, setReportQueryDraft] = useState("")
  const [reportPage, setReportPage] = useState(1)
  const names: NameMap = new Map([...memberOptions, ...context.candidates, ...context.participants].map((member) => [member.memberId, member]))
  const reviews = filterAdminReviews(context.reviews, names, query, validity, memberFilter)
  const reviewPages = Math.max(1, Math.ceil(reviews.length / PAGE_SIZE))
  const currentReviewPage = Math.min(reviewPage, reviewPages)
  const reports = context.reports.filter((report) => (!memberFilter || report.reporterId === memberFilter || report.revieweeId === memberFilter) && (reportStatus === "all" || report.status === reportStatus) && `${memberText(names, report.reporterId)} ${memberText(names, report.revieweeId)} ${report.detail}`.toLocaleLowerCase().includes(reportQuery.trim().toLocaleLowerCase()))
  const reportPages = Math.max(1, Math.ceil(reports.length / PAGE_SIZE))
  const currentReportPage = Math.min(reportPage, reportPages)

  return <div className="space-y-6">
    <section aria-labelledby="activity-review-records" className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3"><Star className="mt-0.5 size-5 shrink-0 text-primary" /><div><h2 id="activity-review-records" className="font-semibold">评分记录</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">有效性调整保留原始评分与处理历史。不会自动生成合拍分数或更改匹配关系。</p></div></div>
      <form onSubmit={(event) => { event.preventDefault(); if (!confirmActivityReviewNavigation()) return; setQuery(queryDraft); setReviewPage(1) }} className="mt-4 grid gap-3 sm:grid-cols-[1fr_150px_auto]">
        <label className="relative block"><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" /><input aria-label="检索评分记录" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="检索评价人、被评人或评论内容" className={`${fieldClass} pl-9`} /></label>
        <select aria-label="筛选评分有效性" value={validity} onChange={(event) => { if (!confirmActivityReviewNavigation()) return; setValidity(event.target.value); setReviewPage(1) }} className={fieldClass}><option value="all">全部评分</option><option value="valid">有效评分</option><option value="invalid">无效评分</option></select>
        <button type="submit" className={secondaryButtonClass}>检索评分</button>
      </form>
      <div className="mt-4 space-y-3">{reviews.length ? reviews.slice((currentReviewPage - 1) * PAGE_SIZE, currentReviewPage * PAGE_SIZE).map((review) => <ReviewRecord key={`${review.id}:${review.version}`} review={review} names={names} context={context} saveAction={moderateReviewAction} onSaved={onSaved} />) : <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">当前筛选条件下暂无评分记录</p>}</div>
      <Pagination label="评分记录分页" page={currentReviewPage} pages={reviewPages} total={reviews.length} setPage={setReviewPage} />
    </section>
    {context.canModerateReports ? <section aria-labelledby="activity-report-records" className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" /><div><h2 id="activity-report-records" className="font-semibold">活动举报处理</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">举报与评分分开审核。此处的举报身份、原文及内部处理说明仅供授权管理员查看。</p></div></div>
      <form onSubmit={(event) => { event.preventDefault(); if (!confirmActivityReviewNavigation()) return; setReportQuery(reportQueryDraft); setReportPage(1) }} className="mt-4 grid gap-3 sm:grid-cols-[1fr_150px_auto]">
        <label className="relative block"><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" /><input aria-label="检索活动举报" value={reportQueryDraft} onChange={(event) => setReportQueryDraft(event.target.value)} placeholder="检索举报双方或举报内容" className={`${fieldClass} pl-9`} /></label>
        <select aria-label="筛选举报处理状态" value={reportStatus} onChange={(event) => { if (!confirmActivityReviewNavigation()) return; setReportStatus(event.target.value); setReportPage(1) }} className={fieldClass}><option value="all">全部状态</option>{Object.entries(REPORT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <button type="submit" className={secondaryButtonClass}>检索举报</button>
      </form>
      <div className="mt-4 space-y-3">{reports.length ? reports.slice((currentReportPage - 1) * PAGE_SIZE, currentReportPage * PAGE_SIZE).map((report) => <ReportRecord key={`${report.id}:${report.version}`} report={report} names={names} context={context} saveAction={moderateReportAction} onSaved={onSaved} />) : <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">当前筛选条件下暂无举报</p>}</div>
      <Pagination label="活动举报分页" page={currentReportPage} pages={reportPages} total={reports.length} setPage={setReportPage} />
    </section> : <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">当前权限无法查看活动举报明细。</p>}
  </div>
}

function ReviewRecord({ review, names, context, saveAction, onSaved }: { review: ActivityReview; names: NameMap; context: AdminActivityReviewContext; saveAction: (input: ModerateActivityReviewInput) => Promise<ActivityReviewActionResult>; onSaved?: () => void }) {
  const [valid, setValid] = useState(review.valid)
  const [reason, setReason] = useState("")
  const mutation = useAdminReviewMutation()
  const canRefresh = useUnsavedActivityReviews((valid !== review.valid || reason.length > 0) && !mutation.success)
  const disabled = !context.canManageSettings || mutation.pending || mutation.success
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (disabled || valid === review.valid || !adminAuditReasonIsValid(reason) || !canRefresh()) return
    if (await mutation.run(() => saveAction({ roundId: context.roundId, reviewId: review.id, valid, expectedVersion: review.version, reason: reason.trim() }))) onSaved?.()
  }
  return <article className="rounded-lg border border-border p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="break-words text-sm font-medium">{memberText(names, review.reviewerId)} <span className="text-muted-foreground">→</span> {memberText(names, review.revieweeId)}</p><p className="mt-1 text-xs text-muted-foreground">最后更新：{formatAdminDateTime(review.updatedAt)} · 版本 {review.version}</p></div>
      <div className="flex shrink-0 items-center gap-2"><span className="text-xl font-semibold tabular-nums text-primary">{review.score.toFixed(1)}<span className="ml-1 text-xs font-normal text-muted-foreground">/ 5</span></span><span className={`rounded-full px-2 py-1 text-xs ${review.valid ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"}`}>{review.valid ? "有效" : "无效"}</span></div>
    </div>
    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{review.comment || "未填写文字评价"}</p>
    <details className="mt-3 border-t border-border pt-3"><summary className="min-h-8 cursor-pointer text-sm font-medium text-primary">审核与处理历史</summary>
      <div className="mt-3 space-y-3"><ReviewHistory entries={context.audit.filter((item) => item.reviewId === review.id)} />
        {context.canManageSettings ? <form onSubmit={submit} className="space-y-3 rounded-lg bg-muted/20 p-3"><label className="block space-y-1.5 text-sm"><span className="font-medium">评分有效性</span><select aria-label={`评分 ${review.id} 有效性`} value={valid ? "valid" : "invalid"} onChange={(event) => setValid(event.target.value === "valid")} disabled={disabled} className={fieldClass}><option value="valid">有效</option><option value="invalid">无效</option></select></label><AuditReasonField id={`review-reason-${review.id}`} value={reason} onChange={setReason} disabled={disabled} /><button type="submit" disabled={disabled || valid === review.valid || !adminAuditReasonIsValid(reason)} className={primaryButtonClass}>{mutation.pending ? "保存中…" : "保存审核结果"}</button><MutationFeedback error={mutation.error} success={mutation.success} /></form> : null}
      </div>
    </details>
  </article>
}

function ReportRecord({ report, names, context, saveAction, onSaved }: { report: ActivityReport; names: NameMap; context: AdminActivityReviewContext; saveAction: (input: ModerateActivityReportInput) => Promise<ActivityReviewActionResult>; onSaved?: () => void }) {
  const [status, setStatus] = useState(report.status)
  const [internalNote, setInternalNote] = useState(report.internalNote ?? "")
  const validNote = Array.from(internalNote.trim()).length >= 4 && Array.from(internalNote.trim()).length <= 2000
  const [reason, setReason] = useState("")
  const mutation = useAdminReviewMutation()
  const canRefresh = useUnsavedActivityReviews((status !== report.status || internalNote !== (report.internalNote ?? "") || reason.length > 0) && !mutation.success)
  const disabled = mutation.pending || mutation.success
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (disabled || !validNote || !adminAuditReasonIsValid(reason) || !canRefresh()) return
    if (await mutation.run(() => saveAction({ roundId: context.roundId, reportId: report.id, status, internalNote: internalNote.trim(), expectedVersion: report.version, reason: reason.trim() }))) onSaved?.()
  }
  return <article className="rounded-lg border border-destructive/20 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{memberText(names, report.reporterId)} <span className="text-muted-foreground">举报</span> {memberText(names, report.revieweeId)}</p><p className="mt-1 text-xs text-muted-foreground">{REPORT_CATEGORY_LABELS[report.category]} · 首次提交：{formatAdminDateTime(report.createdAt)}</p></div><span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs text-destructive">{REPORT_STATUS_LABELS[report.status]}</span></div>
    <details className="mt-3"><summary className="min-h-8 cursor-pointer text-sm font-medium text-primary">查看举报详情与处理</summary><div className="mt-3 space-y-4">
      <div className="rounded-lg bg-muted/30 p-3"><h3 className="text-xs font-medium text-muted-foreground">当前举报内容</h3><p className="mt-1 text-xs text-muted-foreground">最后更新：{formatAdminDateTime(report.updatedAt)} · 版本 {report.version}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{report.detail}</p></div>
      {report.supplements.length ? <div className="space-y-2"><h3 className="text-sm font-medium">补充信息</h3>{report.supplements.map((item, index) => <div key={`${item.createdAt}:${index}`} className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{formatAdminDateTime(item.createdAt)}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{item.detail}</p></div>)}</div> : null}
      <ReviewHistory entries={context.audit.filter((item) => item.reportId === report.id)} />
      <form onSubmit={submit} className="space-y-3 border-t border-border pt-4">
        <label className="block space-y-1.5 text-sm"><span className="font-medium">处理状态</span><select aria-label={`举报 ${report.id} 处理状态`} value={status} onChange={(event) => setStatus(event.target.value as ActivityReport["status"])} disabled={disabled} className={fieldClass}>{Object.entries(REPORT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="block space-y-1.5 text-sm"><span className="font-medium">内部处理说明<span className="ml-1 text-destructive">*</span></span><textarea aria-label={`举报 ${report.id} 内部处理说明`} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} disabled={disabled} required maxLength={4000} rows={3} className={fieldClass} placeholder="记录核查情况及后续处理，4–2000 字，不向玩家展示" /><span className="block text-xs text-muted-foreground">4–2000 字，仅授权管理员可见。</span></label>
        <AuditReasonField id={`report-reason-${report.id}`} value={reason} onChange={setReason} disabled={disabled} />
        <button type="submit" disabled={disabled || !validNote || !adminAuditReasonIsValid(reason)} className={primaryButtonClass}>{mutation.pending ? "保存中…" : "保存举报处理"}</button>
        <MutationFeedback error={mutation.error} success={mutation.success} />
      </form>
    </div></details>
  </article>
}

function Pagination({ label, page, pages, total, setPage }: { label: string; page: number; pages: number; total: number; setPage: (page: number) => void }) {
  return <nav aria-label={label} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="text-xs text-muted-foreground">共 {total} 条 · 第 {page} / {pages} 页</p><div className="flex gap-2"><button type="button" onClick={() => { if (confirmActivityReviewNavigation()) setPage(page - 1) }} disabled={page <= 1} className={secondaryButtonClass}>上一页</button><button type="button" onClick={() => { if (confirmActivityReviewNavigation()) setPage(page + 1) }} disabled={page >= pages} className={secondaryButtonClass}>下一页</button></div></nav>
}

export function memberText(names: NameMap, memberId: string | undefined) {
  const member = memberId ? names.get(memberId) : undefined
  if (!member) return "不可用成员"
  return `${member.fullName || "未填写姓名"}${member.nickname ? `（${member.nickname}）` : ""}`
}

export function filterAdminReviews(reviews: ActivityReview[], names: NameMap, query: string, validity: string, memberFilter: string | null) {
  const search = query.trim().toLocaleLowerCase()
  return reviews.filter((review) => (!memberFilter || review.reviewerId === memberFilter || review.revieweeId === memberFilter) && (validity === "all" || review.valid === (validity === "valid")) && `${memberText(names, review.reviewerId)} ${memberText(names, review.revieweeId)} ${review.comment}`.toLocaleLowerCase().includes(search))
}
