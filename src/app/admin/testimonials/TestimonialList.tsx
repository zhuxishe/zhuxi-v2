"use client"

import { useState } from "react"
import { deleteTestimonial, toggleTestimonialPublished, updateTestimonial } from "./actions"
import { Button } from "@/components/ui/button"
import { Trash2, Eye, EyeOff, Pencil } from "lucide-react"
import type { Testimonial } from "@/lib/queries/testimonials"

export function TestimonialList({ testimonials }: { testimonials: Testimonial[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">共 {testimonials.length} 条评论</p>
      {testimonials.map((t) => (
        <TestimonialItem key={t.id} item={t} />
      ))}
    </div>
  )
}

function TestimonialItem({ item }: { item: Testimonial }) {
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleToggle() {
    setLoading(true)
    await toggleTestimonialPublished(item.id, !item.is_published)
    setLoading(false)
  }

  async function handleDelete() {
    if (!confirm(`确定删除「${item.name}」的评论？`)) return
    setLoading(true)
    await deleteTestimonial(item.id)
    setLoading(false)
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    await updateTestimonial(item.id, {
      name: fd.get("name") as string,
      school: (fd.get("school") as string) || undefined,
      quote: fd.get("quote") as string,
      sort_order: Number(fd.get("sort_order") || 0),
    })
    setLoading(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <form onSubmit={handleUpdate} className="rounded-xl bg-card p-4 ring-1 ring-primary/30 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input name="name" required defaultValue={item.name} className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          <input name="school" defaultValue={item.school ?? ""} className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        </div>
        <textarea name="quote" required defaultValue={item.quote} rows={3} className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 w-full" />
        <input name="sort_order" type="number" defaultValue={item.sort_order} className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 w-24" />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? "保存中..." : "保存"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            取消
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold">{item.name}</span>
          {item.school && <span className="text-xs text-muted-foreground">{item.school}</span>}
          {!item.is_published && (
            <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">隐藏</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">{item.quote}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => setEditing(true)} disabled={loading}>
          <Pencil className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleToggle} disabled={loading}>
          {item.is_published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={handleDelete} disabled={loading}>
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>
    </div>
  )
}
