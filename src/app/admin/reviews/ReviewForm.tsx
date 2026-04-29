"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createPastEventReview } from "./actions"

const inputClass = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

function parseGalleryUrls(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function ReviewForm() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const result = await createPastEventReview({
      title: fd.get("title") as string,
      summary: fd.get("summary") as string,
      cover_url: fd.get("cover_url") as string,
      gallery_urls: parseGalleryUrls(fd.get("gallery_urls")),
      source_url: (fd.get("source_url") as string) || undefined,
      event_date: (fd.get("event_date") as string) || undefined,
      sort_order: Number(fd.get("sort_order") || 0),
    })
    setLoading(false)
    if (result.error) return setError(result.error)
    setOpen(false)
    e.currentTarget.reset()
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="size-4 mr-1" /> 添加往期回顾
      </Button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="title" required placeholder="标题" className={inputClass} />
        <input name="event_date" type="date" className={inputClass} />
        <input name="cover_url" required placeholder="封面图 URL" className={`${inputClass} sm:col-span-2`} />
        <input name="source_url" placeholder="小红书/来源链接（可选）" className={`${inputClass} sm:col-span-2`} />
      </div>
      <textarea name="summary" required placeholder="底部短文案" rows={3} className={`${inputClass} w-full`} />
      <textarea name="gallery_urls" placeholder="更多图片 URL，每行一个（可选）" rows={3} className={`${inputClass} w-full`} />
      <input name="sort_order" type="number" defaultValue={0} className={`${inputClass} w-28`} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading}>{loading ? "保存中..." : "保存"}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>取消</Button>
      </div>
    </form>
  )
}
