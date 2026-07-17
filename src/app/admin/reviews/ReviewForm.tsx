"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createPastEventReview } from "./actions"
import { LargeActivityFields, reviewInputFromFormData } from "./LargeActivityFields"

export function ReviewForm() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const result = await createPastEventReview(reviewInputFromFormData(fd))
    setLoading(false)
    if (result.error) return setError(result.error)
    setOpen(false)
    e.currentTarget.reset()
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="size-4 mr-1" /> 添加大型活动
      </Button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-5">
      <LargeActivityFields />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading}>{loading ? "保存中..." : "保存"}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>取消</Button>
      </div>
    </form>
  )
}
