"use client"

import { useState } from "react"
import { createTestimonial } from "./actions"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export function TestimonialForm() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    const result = await createTestimonial({
      name: fd.get("name") as string,
      school: (fd.get("school") as string) || undefined,
      quote: fd.get("quote") as string,
      sort_order: Number(fd.get("sort_order") || 0),
    })
    setLoading(false)
    if (result.success) {
      setOpen(false)
      ;(e.target as HTMLFormElement).reset()
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="size-4 mr-1" /> 添加评论
      </Button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input name="name" required placeholder="姓名" className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        <input name="school" placeholder="学校（可选）" className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
      </div>
      <textarea name="quote" required placeholder="评论内容" rows={3} className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 w-full" />
      <input name="sort_order" type="number" defaultValue={0} placeholder="排序" className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 w-24" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "保存中..." : "保存"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          取消
        </Button>
      </div>
    </form>
  )
}
