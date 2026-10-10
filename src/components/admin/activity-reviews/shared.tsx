"use client"

import { useState } from "react"
import { formatAdminDateTime } from "@/lib/admin-datetime"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import type { ActivityReviewActionResult, ActivityReviewAudit } from "@/lib/activity-reviews/types"

export const fieldClass = "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
export const primaryButtonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
export const secondaryButtonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
export const REPORT_CATEGORY_LABELS = { harassment: "骚扰或不当言行", privacy: "隐私问题", disruption: "干扰活动", other: "其他" } as const

export type MutationResult = ActivityReviewActionResult

export function useAdminReviewMutation() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function run(action: () => Promise<MutationResult>) {
    if (pending) return false
    setPending(true)
    setError(null)
    setSuccess(false)
    try {
      const result = await action()
      if (result.error) { setError(adminReviewErrorMessage(result.error)); return false }
      if (!result.success) { setError("未能确认保存结果，请刷新核对后重试"); return false }
      setSuccess(true)
      return true
    } catch {
      setError("保存失败，请检查网络后重试；当前输入已保留")
      return false
    } finally {
      setPending(false)
    }
  }

  return { pending, error, success, run }
}

export function adminReviewErrorMessage(code: string) {
  const messages: Record<string, string> = {
    PEER_VERSION_CONFLICT: "记录已被其他管理员或玩家更新。本次修改未保存，输入已保留；请刷新核对最新内容后重试。",
    PEER_REQUEST_CONFLICT: "本次请求与已有提交冲突，请刷新核对最新记录后重试。",
    PEER_ROSTER_REQUIRED: "请先确认至少两名实际到场玩家，再开放互评。",
    PEER_SETTINGS_INVALID: "请检查开放时间与截止时间，截止时间必须晚于开放时间。",
    PEER_REASON_REQUIRED: "请填写 4–500 字的操作理由。",
    PEER_REPORT_INVALID: "请检查举报状态及内部处理说明；处理说明需为 4–2000 字。",
    PEER_NOT_ELIGIBLE: "所选成员中存在不符合参与条件的账号，请重新核对名册。",
    PEER_ADMIN_REQUIRED: "当前账号没有管理此活动互评的权限。",
    PEER_AUTH_REQUIRED: "登录状态已失效，请重新登录后操作。",
    PEER_UNAVAILABLE: "活动互评暂不可用，请确认数据库升级已完成。",
    PEER_ROUND_NOT_FOUND: "未找到本场报名活动，请返回选择其他活动。",
    PEER_REVIEW_NOT_FOUND: "未找到这条评分，请刷新页面核对。",
    PEER_REPORT_NOT_FOUND: "未找到这条举报，请刷新页面核对。",
    PEER_INVALID_INPUT: "提交内容不完整，请检查参与人数、所选成员及操作理由。",
  }
  return messages[code] ?? (code.startsWith("PEER_") ? "保存失败，输入已保留。请刷新核对记录后重试。" : code)
}

export function MutationFeedback({ error, success }: { error: string | null; success: boolean }) {
  return <>
    {error ? <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
    {success ? <p role="status" className="text-sm text-emerald-700">已保存</p> : null}
  </>
}

export function AuditReasonField({ id, value, onChange, disabled = false, label = "本次操作理由" }: {
  id: string; value: string; onChange: (value: string) => void; disabled?: boolean; label?: string
}) {
  const invalid = value.length > 0 && !adminAuditReasonIsValid(value)
  return <label htmlFor={id} className="block space-y-1.5 text-sm">
    <span className="font-medium">{label}<span className="ml-1 text-destructive">*</span></span>
    <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}
      rows={2} required maxLength={1000} aria-invalid={invalid} aria-describedby={`${id}-hint`}
      placeholder="填写具体理由，4–500 字" className={fieldClass} />
    <span id={`${id}-hint`} className={`block text-xs ${invalid ? "text-destructive" : "text-muted-foreground"}`}>4–500 字，仅用于内部处理与审计，不发送给玩家。</span>
  </label>
}

export function ReviewHistory({ entries }: { entries: ActivityReviewAudit[] }) {
  return <details className="rounded-lg border border-border bg-muted/20 px-3 py-2">
    <summary className="min-h-8 cursor-pointer text-sm font-medium">处理历史（{entries.length}）</summary>
    {entries.length ? <ol className="mt-3 space-y-3 border-l border-border pl-4">
      {entries.map((entry) => <li key={entry.id} className="space-y-1 text-sm">
        <p className="font-medium">{auditActionLabel(entry.action)}</p>
        <p className="text-xs text-muted-foreground">{auditActorLabel(entry)} · {formatAdminDateTime(entry.createdAt)}</p>
        {entry.reason ? <p className="whitespace-pre-wrap break-words text-muted-foreground">{entry.reason}</p> : null}
        {entry.details ? <HistoryChanges before={entry.details.before} after={entry.details.after} expanded={entry.action === "report_updated"} /> : null}
      </li>)}
    </ol> : <p className="py-2 text-xs text-muted-foreground">暂无处理记录</p>}
  </details>
}

function HistoryChanges({ before, after, expanded = false }: { before: unknown; after: unknown; expanded?: boolean }) {
  const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const previous = record(before)
  const next = record(after)
  const fields = [
    ["version", "版本"], ["score", "分数"], ["valid", "评分有效"], ["enabled", "互评启用"], ["included", "在名册中"],
    ["opens_at", "开放时间"], ["closes_at", "截止时间"], ["status", "处理状态"], ["comment", "文字评价"], ["internal_note", "内部处理说明"],
    ["category", "举报类型"], ["details", "举报内容"],
  ].filter(([field]) => field in previous || field in next)
  if (fields.length === 0 && !Array.isArray(previous.participants) && !Array.isArray(next.participants)) return null
  return <details open={expanded} className="pt-1"><summary className="cursor-pointer text-xs text-primary">查看修改前后</summary><dl className="mt-2 space-y-2 rounded-lg bg-background p-3 text-xs">
    {fields.map(([field, label]) => <div key={field} className="space-y-1"><dt className="font-medium">{label}</dt>{field === "category" || field === "details" ? <dd className="grid gap-2 sm:grid-cols-2">
      <div className="min-w-0 rounded-md border border-border p-2"><p className="mb-1 font-medium text-muted-foreground">修改前</p><p className="whitespace-pre-wrap break-words leading-5">{historyValue(previous[field], field)}</p></div>
      <div className="min-w-0 rounded-md border border-primary/20 bg-primary/5 p-2"><p className="mb-1 font-medium text-muted-foreground">修改后</p><p className="whitespace-pre-wrap break-words leading-5">{historyValue(next[field], field)}</p></div>
    </dd> : <dd className="whitespace-pre-wrap break-words text-muted-foreground">{historyValue(previous[field], field)} → {historyValue(next[field], field)}</dd>}</div>)}
    {Array.isArray(previous.participants) || Array.isArray(next.participants) ? <div><dt className="font-medium">名册参与人数</dt><dd className="text-muted-foreground">{includedCount(previous.participants)} → {includedCount(next.participants)}</dd></div> : null}
  </dl></details>
}

function includedCount(value: unknown) { return Array.isArray(value) ? value.filter((item) => item && typeof item === "object" && item.included === true).length : 0 }
function historyValue(value: unknown, field: string) {
  if (value === null || value === undefined) return "未记录"
  if (typeof value === "boolean") return value ? "是" : "否"
  if (field.endsWith("_at") && typeof value === "string") return formatAdminDateTime(value)
  if (field === "status" && typeof value === "string") return ({ pending: "待处理", reviewing: "核查中", resolved: "已处理", dismissed: "已驳回" } as Record<string, string>)[value] ?? value
  if (field === "category" && typeof value === "string") return REPORT_CATEGORY_LABELS[value as keyof typeof REPORT_CATEGORY_LABELS] ?? value
  return typeof value === "string" || typeof value === "number" ? String(value) || "空" : "—"
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    settings_changed: "更新开放设置", roster_confirmed: "确认参与名册", participant_changed: "调整参与成员", registration_restored: "补录恢复报名",
    review_created: "提交评分", review_revised: "修改评分", review_moderated: "审核评分有效性", review_invalidated_roster: "因名册调整标记评分无效",
    report_created: "提交举报", report_updated: "修改举报内容", report_supplemented: "补充举报信息", report_moderated: "处理举报", feedback_submitted: "提交活动反馈",
  }
  return labels[action] ?? "记录变更"
}

function auditActorLabel(entry: ActivityReviewAudit) {
  if (entry.actorKind === "system") return "系统"
  const label = entry.actorKind === "admin" ? "管理员" : entry.actorKind === "player" ? "玩家" : "操作者"
  return entry.actorId ? `${label} ${entry.actorId.slice(0, 8)}` : label
}
