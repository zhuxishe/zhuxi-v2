"use client"

import { useState } from "react"
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cssImageUrl } from "@/lib/css-image-url"
import type { PastEventReview } from "@/lib/queries/past-event-reviews"
import { deletePastEventReview, togglePastEventReviewPublished, updatePastEventReview } from "./actions"
import { LargeActivityFields, reviewInputFromFormData } from "./LargeActivityFields"

export function ReviewList({ reviews }: { reviews: PastEventReview[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">共 {reviews.length} 个大型活动</p>
      {reviews.map((review) => <ReviewItem key={review.id} item={review} />)}
    </div>
  )
}

function ReviewItem({ item }: { item: PastEventReview }) {
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const result = await updatePastEventReview(item.id, {
      ...reviewInputFromFormData(fd),
    })
    setLoading(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setEditing(false)
  }

  async function handleDelete() {
    if (!confirm(`确定删除「${item.title}」？`)) return
    setLoading(true)
    setError(null)
    const result = await deletePastEventReview(item.id)
    setLoading(false)
    if (result.error) setError(result.error)
  }

  async function handleWebsiteVisibility() {
    setLoading(true)
    setError(null)
    const result = await togglePastEventReviewPublished(item.id, !item.is_published)
    setLoading(false)
    if (result.error) setError(result.error)
  }

  if (editing) {
    return <ReviewEditForm item={item} loading={loading} error={error} onSubmit={handleUpdate} onCancel={() => setEditing(false)} />
  }

  return (
    <div className="relative flex gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="h-20 w-28 shrink-0 rounded-lg bg-cover bg-center" style={{ backgroundImage: cssImageUrl(item.cover_url) }} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{item.title}</span>
          {item.event_date && <span className="text-xs text-muted-foreground">{item.event_date}</span>}
          <StatusBadge status={item.status ?? (item.is_published ? "published" : "draft")} />
          {item.is_published && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">官网展示</span>}
          {item.show_on_player_home && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">活动首页</span>}
          {item.pin_in_player_library && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">活动库置顶</span>}
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">{item.summary}</p>
        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="编辑大型活动" title="编辑大型活动" onClick={() => setEditing(true)} disabled={loading}><Pencil className="size-4" /></Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={item.is_published ? "从官网往期回顾隐藏" : "在官网往期回顾展示"}
          title={item.is_published ? "从官网往期回顾隐藏" : "在官网往期回顾展示"}
          onClick={handleWebsiteVisibility}
          disabled={loading}
        >
          {item.is_published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
        <Button variant="ghost" size="icon" aria-label="删除大型活动" title="删除大型活动" onClick={handleDelete} disabled={loading}><Trash2 className="size-4 text-destructive" /></Button>
      </div>
    </div>
  )
}

function ReviewEditForm({ item, loading, error, onSubmit, onCancel }: { item: PastEventReview; loading: boolean; error: string | null; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return (
    <form onSubmit={onSubmit} className="rounded-xl bg-card p-5 ring-1 ring-primary/30 space-y-5">
      <LargeActivityFields item={item} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading}>{loading ? "保存中..." : "保存"}</Button>
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
