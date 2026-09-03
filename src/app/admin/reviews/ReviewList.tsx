"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Archive, Eye, EyeOff, Pencil, RotateCcw, Smartphone, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cssImageUrl } from "@/lib/css-image-url"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import type { PastEventReview } from "@/lib/queries/past-event-reviews"
import {
  archivePastEventReview,
  permanentlyDeletePastEventReview,
  restorePastEventReview,
  togglePastEventReviewPlayerVisible,
  togglePastEventReviewPublished,
  updatePastEventReview,
} from "./actions"
import { LargeActivityFields, reviewInputFromFormData } from "./LargeActivityFields"

interface Props {
  reviews: PastEventReview[]
  total: number
  archived: boolean
  canManageRecycleBin: boolean
}

export function ReviewList({ reviews, total, archived, canManageRecycleBin }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">共 {total} 个{archived ? "已归档" : "当前"}大型活动</p>
      {reviews.map((review) => (
        <ReviewItem
          key={review.id}
          item={review}
          archived={archived}
          canManageRecycleBin={canManageRecycleBin}
        />
      ))}
    </div>
  )
}

function ReviewItem({ item, archived, canManageRecycleBin }: { item: PastEventReview; archived: boolean; canManageRecycleBin: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [auditReason, setAuditReason] = useState("")
  const [purgeStep, setPurgeStep] = useState<0 | 1 | 2>(0)
  const [titleConfirmation, setTitleConfirmation] = useState("")
  const reasonValid = adminAuditReasonIsValid(auditReason)

  function beginOperation() {
    setLoading(true)
    setError(null)
    setMessage(null)
  }

  function finishOperation(result: { error?: string; success?: boolean }, successMessage?: string) {
    setLoading(false)
    if (result.error) {
      setError(result.error)
      return false
    }
    if (successMessage) setMessage(successMessage)
    router.refresh()
    return true
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    beginOperation()
    const fd = new FormData(e.currentTarget)
    const result = await updatePastEventReview(
      item.id,
      reviewInputFromFormData(fd),
      auditReason,
      item.updated_at,
    )
    if (finishOperation(result, "大型活动已保存")) setEditing(false)
  }

  async function handleArchive() {
    if (!confirm(`将「${item.title}」移入回收站？归档后官网与 Player App 都会隐藏。`)) return
    beginOperation()
    finishOperation(await archivePastEventReview(item.id, auditReason, item.updated_at))
  }

  async function handleWebsiteVisibility() {
    beginOperation()
    finishOperation(
      await togglePastEventReviewPublished(item.id, !item.is_published, auditReason, item.updated_at),
      item.is_published ? "已从官网隐藏" : "已在官网显示",
    )
  }

  async function handlePlayerVisibility() {
    beginOperation()
    finishOperation(
      await togglePastEventReviewPlayerVisible(item.id, !item.is_player_visible, auditReason, item.updated_at),
      item.is_player_visible ? "已从 Player App 隐藏" : "已在 Player App 显示",
    )
  }

  async function handleRestore() {
    beginOperation()
    finishOperation(await restorePastEventReview(item.id, auditReason, item.updated_at))
  }

  async function handlePermanentDelete() {
    if (titleConfirmation !== item.title) return
    beginOperation()
    const result = await permanentlyDeletePastEventReview(item.id, auditReason, item.updated_at)
    setLoading(false)
    if (result.error) {
      setError(result.error)
      return
    }
    if (result.warning) setMessage(result.warning)
    setPurgeStep(0)
    setTitleConfirmation("")
    router.refresh()
  }

  if (editing && !archived) {
    return (
      <ReviewEditForm
        item={item}
        loading={loading}
        error={error}
        auditReason={auditReason}
        onAuditReasonChange={setAuditReason}
        onSubmit={handleUpdate}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex gap-4">
        <div className="h-20 w-28 shrink-0 rounded-lg bg-cover bg-center" style={{ backgroundImage: cssImageUrl(item.cover_url) }} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{item.title}</span>
            {item.event_date && <span className="text-xs text-muted-foreground">{item.event_date}</span>}
            <StatusBadge status={item.status ?? (item.is_published ? "published" : "draft")} />
            {archived && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">已归档</span>}
            {item.is_published && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">官网展示</span>}
            {item.is_player_visible && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700">Player 展示</span>}
            {item.show_on_player_home && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">活动首页</span>}
            {item.pin_in_player_library && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">活动库置顶</span>}
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">{item.summary}</p>
          {archived && item.archive_reason && <p className="mt-1 text-xs text-muted-foreground">归档理由：{item.archive_reason}</p>}
        </div>
        {!archived && (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="编辑大型活动" title="编辑大型活动" onClick={() => setEditing(true)} disabled={loading}><Pencil className="size-4" /></Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={item.is_published ? "从官网往期回顾隐藏" : "在官网往期回顾展示"}
              title={item.is_published ? "从官网往期回顾隐藏" : "在官网往期回顾展示"}
              onClick={handleWebsiteVisibility}
              disabled={loading || !reasonValid}
            >
              {item.is_published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={item.is_player_visible ? "从 Player App 隐藏" : "在 Player App 显示"}
              title={item.is_player_visible ? "从 Player App 隐藏" : "在 Player App 显示"}
              onClick={handlePlayerVisibility}
              disabled={loading || !reasonValid}
            >
              <Smartphone className={`size-4 ${item.is_player_visible ? "text-violet-600" : "text-muted-foreground"}`} />
            </Button>
            <Button variant="ghost" size="icon" aria-label="移入回收站" title="移入回收站" onClick={handleArchive} disabled={loading || !reasonValid}><Archive className="size-4 text-destructive" /></Button>
          </div>
        )}
      </div>

      <label className="grid gap-1 text-xs font-medium">
        本次操作理由 *
        <input
          value={auditReason}
          onChange={(event) => setAuditReason(event.target.value)}
          minLength={4}
          maxLength={500}
          placeholder="必填，4–500 字；用于显示切换、归档或恢复"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </label>

      {archived && canManageRecycleBin && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleRestore} disabled={loading || !reasonValid}>
              <RotateCcw className="size-4" />恢复
            </Button>
            {purgeStep === 0 && (
              <Button type="button" variant="destructive" size="sm" onClick={() => setPurgeStep(1)} disabled={loading || !reasonValid}>
                <Trash2 className="size-4" />永久删除
              </Button>
            )}
          </div>
          {purgeStep === 1 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p>永久删除无法恢复，并会清理托管图片。请先确认你理解该影响。</p>
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="destructive" size="sm" onClick={() => setPurgeStep(2)}>继续确认</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setPurgeStep(0)}>取消</Button>
              </div>
            </div>
          )}
          {purgeStep === 2 && (
            <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <label className="grid gap-1 text-xs font-medium">
                再次确认：输入活动标题“{item.title}”
                <input
                  value={titleConfirmation}
                  onChange={(event) => setTitleConfirmation(event.target.value)}
                  className="rounded-lg border border-destructive/40 bg-background px-3 py-2 text-sm"
                />
              </label>
              <div className="flex gap-2">
                <Button type="button" variant="destructive" size="sm" onClick={handlePermanentDelete} disabled={loading || !reasonValid || titleConfirmation !== item.title}>
                  确认永久删除
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setPurgeStep(0); setTitleConfirmation("") }}>取消</Button>
              </div>
            </div>
          )}
        </div>
      )}
      {archived && !canManageRecycleBin && <p className="text-xs text-muted-foreground">只有超级管理员可以恢复或永久删除回收站内容。</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {message && <p role="status" className="text-xs text-primary">{message}</p>}
    </div>
  )
}

function ReviewEditForm({ item, loading, error, auditReason, onAuditReasonChange, onSubmit, onCancel }: {
  item: PastEventReview
  loading: boolean
  error: string | null
  auditReason: string
  onAuditReasonChange: (value: string) => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-xl bg-card p-5 ring-1 ring-primary/30 space-y-5">
      <LargeActivityFields item={item} />
      <label className="grid gap-1 text-xs font-medium">
        本次修改理由 *
        <input
          value={auditReason}
          onChange={(event) => onAuditReasonChange(event.target.value)}
          minLength={4}
          maxLength={500}
          required
          placeholder="必填，4–500 字；将写入后台审计"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading || !adminAuditReasonIsValid(auditReason)}>{loading ? "保存中..." : "保存"}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>取消</Button>
      </div>
    </form>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles = status === "published"
    ? "bg-green-100 text-green-700"
    : status === "cancelled"
      ? "bg-red-100 text-red-700"
      : "bg-orange-100 text-orange-700"
  const label = status === "published" ? "玩家端已发布" : status === "cancelled" ? "玩家端已取消" : "玩家端草稿"
  return <span className={`rounded px-1.5 py-0.5 text-xs ${styles}`}>{label}</span>
}
