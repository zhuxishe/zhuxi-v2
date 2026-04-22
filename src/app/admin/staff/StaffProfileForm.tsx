"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createStaffProfile } from "./actions"

const inputClass = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

export function StaffProfileForm() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const result = await createStaffProfile({
      name: fd.get("name") as string,
      school: fd.get("school") as string,
      major: fd.get("major") as string,
      intro: fd.get("intro") as string,
      avatar_url: (fd.get("avatar_url") as string) || undefined,
      sort_order: Number(fd.get("sort_order") || 0),
    })
    setLoading(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setOpen(false)
    e.currentTarget.reset()
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="size-4 mr-1" /> 添加 Staff
      </Button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="name" required placeholder="姓名" className={inputClass} />
        <input name="school" required placeholder="日本学校" className={inputClass} />
        <input name="major" required placeholder="专业" className={inputClass} />
        <input name="avatar_url" placeholder="头像 URL（可选）" className={inputClass} />
      </div>
      <textarea name="intro" required placeholder="一句话简介" rows={2} className={`${inputClass} w-full`} />
      <input name="sort_order" type="number" defaultValue={0} placeholder="排序" className={`${inputClass} w-24`} />
      {error && <p className="text-sm text-destructive">{error}</p>}
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
