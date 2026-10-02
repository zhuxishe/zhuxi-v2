"use client"

import { useState } from "react"
import { CalendarClock, PauseCircle } from "lucide-react"
import type { ActivityReviewActionResult, ActivityReviewSettings, SaveActivityReviewSettingsInput } from "@/lib/activity-reviews/types"
import { formatTokyoDateTimeLocal, parseTokyoDateTimeLocal } from "@/lib/player-activity/tokyo-datetime"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import { useUnsavedActivityReviews } from "./use-unsaved-activity-reviews"
import { AuditReasonField, fieldClass, MutationFeedback, primaryButtonClass, useAdminReviewMutation } from "./shared"

export function ActivityReviewSettingsForm({ roundId, settings, canManage, saveAction, onSaved }: {
  roundId: string
  settings: ActivityReviewSettings
  canManage: boolean
  saveAction: (input: SaveActivityReviewSettingsInput) => Promise<ActivityReviewActionResult>
  onSaved?: () => void
}) {
  const [enabled, setEnabled] = useState(settings.enabled)
  const [opensAt, setOpensAt] = useState(formatTokyoDateTimeLocal(settings.opensAt))
  const [closesAt, setClosesAt] = useState(formatTokyoDateTimeLocal(settings.closesAt))
  const [reason, setReason] = useState("")
  const mutation = useAdminReviewMutation()
  const dirty = enabled !== settings.enabled || opensAt !== formatTokyoDateTimeLocal(settings.opensAt) || closesAt !== formatTokyoDateTimeLocal(settings.closesAt) || reason.length > 0
  const canRefresh = useUnsavedActivityReviews(dirty && !mutation.success)
  const validDates = Boolean(opensAt && closesAt && Date.parse(parseTokyoDateTimeLocal(closesAt)) > Date.parse(parseTokyoDateTimeLocal(opensAt)))
  const disabled = !canManage || mutation.pending || mutation.success

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (disabled || !validDates || !adminAuditReasonIsValid(reason) || (enabled && !settings.rosterConfirmed) || !canRefresh()) return
    const saved = await mutation.run(() => saveAction({ roundId, enabled, opensAt: parseTokyoDateTimeLocal(opensAt), closesAt: parseTokyoDateTimeLocal(closesAt), expectedVersion: settings.version, reason: reason.trim() }))
    if (saved) onSaved?.()
  }

  return <section className="rounded-xl border border-border bg-card p-5">
    <div className="flex items-start gap-3">
      <CalendarClock className="mt-0.5 size-5 shrink-0 text-primary" />
      <div><h2 className="font-semibold">互评开放设置</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">与报名开关独立。所有时间使用日本时间（UTC+9）。</p></div>
    </div>
    <form onSubmit={submit} className="mt-5 space-y-4">
      {settings.version === 0 ? <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm leading-6 text-primary">首次配置：先填写开放时间并保持开关关闭，保存设置；再确认到场名册，最后启用互评。</p> : null}
      <fieldset disabled={disabled} className="space-y-4">
        <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-3">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="mt-1 size-4 accent-primary" />
          <span className="text-sm"><span className="font-medium">启用本场活动互评</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">启用后仍须处于开放时间内；关闭此开关会暂停新的评分提交。</span></span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm"><span className="font-medium">开放时间</span><input aria-label="互评开放时间" type="datetime-local" value={opensAt} onChange={(event) => setOpensAt(event.target.value)} required className={fieldClass} /></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">截止时间</span><input aria-label="互评截止时间" type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} required min={opensAt || undefined} className={fieldClass} /></label>
        </div>
        {opensAt && closesAt && !validDates ? <p role="alert" className="text-xs text-destructive">截止时间必须晚于开放时间。</p> : null}
        {enabled && !settings.rosterConfirmed ? <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">请先确认参与名册，再启用互评。</p> : null}
        <AuditReasonField id="review-settings-reason" value={reason} onChange={setReason} disabled={disabled} />
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><PauseCircle className="size-3.5" />配置版本 {settings.version} · {settings.rosterConfirmed ? "名册已确认" : "名册待确认"}</span>
        <button type="submit" disabled={disabled || !validDates || !adminAuditReasonIsValid(reason) || (enabled && !settings.rosterConfirmed)} className={primaryButtonClass}>{mutation.pending ? "保存中…" : "保存开放设置"}</button>
      </div>
      <MutationFeedback error={mutation.error} success={mutation.success} />
    </form>
  </section>
}
