"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { STAFF_AVATAR_PRESETS } from "@/lib/constants/staff-avatars"
import { createStaffProfile } from "./actions"
import { uploadStaffAvatar } from "./avatar-actions"

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
    const avatarUrl = await uploadAvatarIfSelected(fd)
    if (typeof avatarUrl !== "string") {
      setLoading(false)
      setError(avatarUrl.error)
      return
    }
    const result = await createStaffProfile({
      name: fd.get("name") as string,
      school: fd.get("school") as string,
      major: fd.get("major") as string,
      intro: fd.get("intro") as string,
      avatar_url: avatarUrl || undefined,
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

  async function uploadAvatarIfSelected(fd: FormData): Promise<string | { error: string }> {
    const file = fd.get("avatar") as File | null
    if (!file || file.size === 0) return (fd.get("preset_avatar") as string) || ""
    const uploadData = new FormData()
    uploadData.append("file", file)
    const result = await uploadStaffAvatar(uploadData)
    if (result.error) return { error: result.error }
    return result.url ?? ""
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
        <input name="avatar" type="file" accept="image/*" className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-bamboo-muted file:px-3 file:py-1 file:text-xs file:text-bamboo`} />
      </div>
      <select name="preset_avatar" defaultValue="" className={inputClass}>
        <option value="">不使用预设头像</option>
        {STAFF_AVATAR_PRESETS.map((avatar) => (
          <option key={avatar.path} value={avatar.path}>{avatar.label}</option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">上传头像优先；未上传时可使用本地预设头像。</p>
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
