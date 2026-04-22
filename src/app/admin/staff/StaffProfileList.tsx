"use client"

import { useState } from "react"
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { StaffProfile } from "@/lib/queries/staff"
import { deleteStaffProfile, toggleStaffProfilePublished, updateStaffProfile } from "./actions"

const inputClass = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

export function StaffProfileList({ staff }: { staff: StaffProfile[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">共 {staff.length} 位 Staff</p>
      {staff.map((item) => (
        <StaffProfileItem key={item.id} item={item} />
      ))}
    </div>
  )
}

function StaffProfileItem({ item }: { item: StaffProfile }) {
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm(`确定删除「${item.name}」？`)) return
    setLoading(true)
    await deleteStaffProfile(item.id)
    setLoading(false)
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    await updateStaffProfile(item.id, {
      name: fd.get("name") as string,
      school: fd.get("school") as string,
      major: fd.get("major") as string,
      intro: fd.get("intro") as string,
      avatar_url: (fd.get("avatar_url") as string) || undefined,
      sort_order: Number(fd.get("sort_order") || 0),
    })
    setLoading(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <form onSubmit={handleUpdate} className="rounded-xl bg-card p-4 ring-1 ring-primary/30 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="name" required defaultValue={item.name} className={inputClass} />
          <input name="school" required defaultValue={item.school} className={inputClass} />
          <input name="major" required defaultValue={item.major} className={inputClass} />
          <input name="avatar_url" defaultValue={item.avatar_url ?? ""} className={inputClass} />
        </div>
        <textarea name="intro" required defaultValue={item.intro} rows={2} className={`${inputClass} w-full`} />
        <input name="sort_order" type="number" defaultValue={item.sort_order} className={`${inputClass} w-24`} />
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
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{item.name}</span>
          <span className="text-xs text-muted-foreground">{item.school} · {item.major}</span>
          {!item.is_published && <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-600">隐藏</span>}
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">{item.intro}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => setEditing(true)} disabled={loading}>
          <Pencil className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => toggleStaffProfilePublished(item.id, !item.is_published)} disabled={loading}>
          {item.is_published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={handleDelete} disabled={loading}>
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>
    </div>
  )
}
