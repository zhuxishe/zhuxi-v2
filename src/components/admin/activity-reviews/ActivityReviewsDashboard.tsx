"use client"

import Link from "next/link"
import { useState } from "react"
import { ClipboardCheck, MessageSquare, ShieldAlert, Users } from "lucide-react"
import type { ActivityReviewActionResult, ActivityReviewStatus, AdminActivityReviewsData, ConfirmActivityReviewRosterInput, ModerateActivityReportInput, ModerateActivityReviewInput, SaveActivityReviewSettingsInput } from "@/lib/activity-reviews/types"
import { formatAdminDateTime } from "@/lib/admin-datetime"
import { ActivityReviewSettingsForm } from "./ActivityReviewSettingsForm"
import { ActivityReviewRoster } from "./ActivityReviewRoster"
import { ActivityReviewModeration } from "./ActivityReviewModeration"
import { fieldClass, primaryButtonClass, ReviewHistory } from "./shared"
import { confirmActivityReviewNavigation } from "./use-unsaved-activity-reviews"

export const ACTIVITY_REVIEW_STATUS_LABELS: Record<ActivityReviewStatus, string> = { unavailable: "未开放", scheduled: "待开放", open: "开放中", closed: "已截止", paused: "已暂停" }
export interface AdminActivityReviewActions {
  saveSettingsAction: (input: SaveActivityReviewSettingsInput) => Promise<ActivityReviewActionResult>
  confirmRosterAction: (input: ConfirmActivityReviewRosterInput) => Promise<ActivityReviewActionResult>
  moderateReviewAction: (input: ModerateActivityReviewInput) => Promise<ActivityReviewActionResult>
  moderateReportAction: (input: ModerateActivityReportInput) => Promise<ActivityReviewActionResult>
}

export function ActivityReviewsDashboard({ data, actions, onNavigate, onSaved }: {
  data: AdminActivityReviewsData
  actions: AdminActivityReviewActions
  onNavigate: (href: string) => void
  onSaved?: () => void
}) {
  const context = data.context
  const [roundId, setRoundId] = useState(context?.roundId ?? "")
  const event = data.events.find((item) => item.roundId === context?.roundId)
  const memberName = data.memberFilter ? data.memberOptions.find((member) => member.memberId === data.memberFilter) : null
  const selectedParticipants = context?.participants.filter((member) => member.included).length ?? 0

  return <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-medium text-primary">活动后的真实互动反馈</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">活动互评</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">确认实际到场名单，开放体验评分，并独立处理活动举报。当前收集的数据暂不计入合拍分数。</p></div>
      {context ? <Link href={`/admin/matching/rounds/${context.roundId}`} className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted">查看报名轮次</Link> : null}
    </header>
    {data.setupRequired ? <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm leading-6 text-amber-950">活动互评的数据迁移尚未就绪。请完成数据库升级后再确认名册及开放互评；此页面暂不提供提交操作。</div> : <>
      <form onSubmit={(submitEvent) => { submitEvent.preventDefault(); if (!roundId || !confirmActivityReviewNavigation()) return; onNavigate(`/admin/activity-reviews?${new URLSearchParams({ roundId, ...(data.memberFilter ? { memberId: data.memberFilter } : {}) })}`) }} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 space-y-1.5 text-sm font-medium"><span>选择活动</span><select aria-label="选择互评活动" value={roundId} onChange={(changeEvent) => setRoundId(changeEvent.target.value)} className={fieldClass}><option value="" disabled>请选择一个报名活动</option>{data.events.map((item) => <option key={item.roundId} value={item.roundId}>{item.title} · {item.settings.version === 0 ? "待配置" : ACTIVITY_REVIEW_STATUS_LABELS[item.status]}</option>)}</select></label>
        <button type="submit" disabled={!roundId} className={primaryButtonClass}>查看活动</button>
      </form>
      {data.memberFilter ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm"><span>当前仅查看与 {memberName?.fullName || memberName?.nickname || "所选成员"} 有关的评分及举报。</span><Link href={`/admin/activity-reviews${context ? `?roundId=${encodeURIComponent(context.roundId)}` : ""}`} className="font-medium text-primary underline underline-offset-4">清除成员筛选</Link></div> : null}
      {context ? <>
        <section className="space-y-4" aria-label="活动互评概览">
          <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold">{context.title}</h2><span className={`rounded-full px-3 py-1 text-xs font-medium ${event?.status === "open" ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"}`}>{context.settings.version === 0 ? "待配置" : ACTIVITY_REVIEW_STATUS_LABELS[event?.status ?? "unavailable"]}</span></div>
          <p className="text-xs text-muted-foreground">开放时间：{formatAdminDateTime(context.settings.opensAt, "未设置")} — {formatAdminDateTime(context.settings.closesAt, "未设置")}（日本时间）</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric icon={Users} label="确认参与人数" value={selectedParticipants} />
            <Metric icon={MessageSquare} label="评分记录" value={event?.reviewCount ?? context.reviews.length} />
            <Metric icon={ClipboardCheck} label="已参与评价人数" value={new Set(context.reviews.map((review) => review.reviewerId).filter(Boolean)).size} />
            <Metric icon={ShieldAlert} label="待处理举报" value={event?.pendingReportCount ?? context.reports.filter((report) => report.status === "pending" || report.status === "reviewing").length} />
          </div>
        </section>
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <ActivityReviewSettingsForm key={`settings:${context.roundId}:${context.settings.version}`} roundId={context.roundId} settings={context.settings} canManage={context.canManageSettings} saveAction={actions.saveSettingsAction} onSaved={onSaved} />
          <ActivityReviewRoster key={`roster:${context.roundId}:${context.settings.version}`} context={context} memberOptions={data.memberOptions} saveAction={actions.confirmRosterAction} onSaved={onSaved} />
        </div>
        <ActivityReviewModeration key={context.roundId} context={context} memberOptions={data.memberOptions} memberFilter={data.memberFilter} moderateReviewAction={actions.moderateReviewAction} moderateReportAction={actions.moderateReportAction} onSaved={onSaved} />
        <section className="rounded-xl border border-border bg-card p-5"><h2 className="mb-3 font-semibold">开放设置与名册历史</h2><ReviewHistory entries={context.audit.filter((item) => !item.reviewId && !item.reportId)} /></section>
      </> : <section className="rounded-xl border border-dashed border-border bg-card px-5 py-14 text-center"><Users className="mx-auto mb-3 size-8 text-primary/50" /><p className="text-sm text-muted-foreground">{data.events.length ? "选择活动后，确认名册并设置互评开放时间。" : "暂无可配置互评的报名活动。"}</p></section>}
    </>}
  </main>
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return <div className="rounded-xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-4" /><span>{label}</span></div><p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p></div>
}
