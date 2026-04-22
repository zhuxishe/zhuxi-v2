"use client"

import Image from "next/image"
import { useState } from "react"
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { STAFF_AVATAR_PRESETS } from "@/lib/constants/staff-avatars"
import type { StaffProfile } from "@/lib/queries/staff"
import { deleteStaffProfile, toggleStaffProfilePublished, updateStaffProfile } from "./actions"
import { uploadStaffAvatar } from "./avatar-actions"

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
    const avatarUrl = await uploadAvatarIfSelected(fd)
    if (typeof avatarUrl !== "string") {
      alert(avatarUrl.error)
      setLoading(false)
      return
    }
    const patch: Parameters<typeof updateStaffProfile>[1] = {
      name: fd.get("name") as string,
      school: fd.get("school") as string,
      major: fd.get("major") as string,
      intro: fd.get("intro") as string,
      sort_order: Number(fd.get("sort_order") || 0),
    }
    if (avatarUrl) patch.avatar_url = avatarUrl
    await updateStaffProfile(item.id, patch)
    setLoading(false)
    setEditing(false)
  }

  async function uploadAvatarIfSelected(fd: FormData): Promise<string | { error: string }> {
    const file = fd.get("avatar") as File | null
    if (!file || file.size === 0) return (fd.get("preset_avatar") as string) || ""
    const uploadData = new FormData()
    uploadData.append("file", file)
    const result = await uploadStaffAvatar(uploadData)
    if (result.error) return { error: result.error }
    return result.url ?? ""
  }

  if (editing) {
    return (
      <form onSubmit={handleUpdate} className="rounded-xl bg-card p-4 ring-1 ring-primary/30 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="name" required defaultValue={item.name} className={inputClass} />
          <input name="school" required defaultValue={item.school} className={inputClass} />
          <input name="major" required defaultValue={item.major} className={inputClass} />
          <input name="avatar" type="file" accept="image/*" className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-bamboo-muted file:px-3 file:py-1 file:text-xs file:text-bamboo`} />
        </div>
        <select name="preset_avatar" defaultValue="" className={inputClass}>
          <option value="">保留当前头像</option>
          {STAFF_AVATAR_PRESETS.map((avatar) => (
            <option key={avatar.path} value={avatar.path}>{avatar.label}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">上传新头像优先；不上传时可改用本地预设头像。</p>
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
      <div className="relative size-12 shrink-0 overflow-hidden rounded-full bg-bamboo-muted text-bamboo">
        {item.avatar_url ? (
          <Image
            src={item.avatar_url}
            alt={item.name}
            fill
            sizes="48px"
            className="object-cover"
            unoptimized={item.avatar_url.endsWith(".svg")}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-base">{item.name[0]}</div>
        )}
      </div>
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
