"use client"

import { useState } from "react"
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cssImageUrl } from "@/lib/css-image-url"
import type { PastEventReview } from "@/lib/queries/past-event-reviews"
import { deletePastEventReview, togglePastEventReviewPublished, updatePastEventReview } from "./actions"

const inputClass = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
const urlsToText = (urls: string[]) => urls.join("\n")
const textToUrls = (value: FormDataEntryValue | null) => String(value ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

export function ReviewList({ reviews }: { reviews: PastEventReview[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">共 {reviews.length} 条往期回顾</p>
      {reviews.map((review) => <ReviewItem key={review.id} item={review} />)}
    </div>
  )
}

function ReviewItem({ item }: { item: PastEventReview }) {
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    await updatePastEventReview(item.id, {
      title: fd.get("title") as string,
      summary: fd.get("summary") as string,
      cover_url: fd.get("cover_url") as string,
      gallery_urls: textToUrls(fd.get("gallery_urls")),
      source_url: (fd.get("source_url") as string) || undefined,
      event_date: (fd.get("event_date") as string) || undefined,
      sort_order: Number(fd.get("sort_order") || 0),
    })
    setLoading(false)
    setEditing(false)
  }

  async function handleDelete() {
    if (!confirm(`确定删除「${item.title}」？`)) return
    setLoading(true)
    await deletePastEventReview(item.id)
    setLoading(false)
  }

  if (editing) {
    return <ReviewEditForm item={item} loading={loading} onSubmit={handleUpdate} onCancel={() => setEditing(false)} />
  }

  return (
    <div className="flex gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="h-20 w-28 shrink-0 rounded-lg bg-cover bg-center" style={{ backgroundImage: cssImageUrl(item.cover_url) }} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{item.title}</span>
          {item.event_date && <span className="text-xs text-muted-foreground">{item.event_date}</span>}
          {!item.is_published && <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-600">隐藏</span>}
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">{item.summary}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => setEditing(true)} disabled={loading}><Pencil className="size-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => togglePastEventReviewPublished(item.id, !item.is_published)} disabled={loading}>
          {item.is_published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={handleDelete} disabled={loading}><Trash2 className="size-4 text-destructive" /></Button>
      </div>
    </div>
  )
}

function ReviewEditForm({ item, loading, onSubmit, onCancel }: { item: PastEventReview; loading: boolean; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return (
    <form onSubmit={onSubmit} className="rounded-xl bg-card p-4 ring-1 ring-primary/30 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="title" required defaultValue={item.title} className={inputClass} />
        <input name="event_date" type="date" defaultValue={item.event_date ?? ""} className={inputClass} />
        <input name="cover_url" required defaultValue={item.cover_url} className={`${inputClass} sm:col-span-2`} />
        <input name="source_url" defaultValue={item.source_url ?? ""} className={`${inputClass} sm:col-span-2`} />
      </div>
      <textarea name="summary" required defaultValue={item.summary} rows={3} className={`${inputClass} w-full`} />
      <textarea name="gallery_urls" defaultValue={urlsToText(item.gallery_urls)} rows={3} className={`${inputClass} w-full`} />
      <input name="sort_order" type="number" defaultValue={item.sort_order} className={`${inputClass} w-28`} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading}>{loading ? "保存中..." : "保存"}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>取消</Button>
      </div>
    </form>
  )
}
