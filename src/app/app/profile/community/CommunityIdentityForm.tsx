"use client"

import Image from "next/image"
import { useActionState, useEffect, useId, useState } from "react"
import { useRouter } from "next/navigation"
import { Droplets, Leaf, Sprout, Upload, UserRound } from "lucide-react"
import { saveCommunityProfileAction } from "./actions"
import { communityAvatarUrl } from "@/lib/community/media"
import type { CommunityActionState, CommunityProfile } from "@/lib/community/types"

const INITIAL_STATE: CommunityActionState = {}

interface CommunityIdentityFormProps {
  profile: CommunityProfile | null
  returnTo?: string
  locale: "zh" | "ja"
}

const PRESETS = [
  { value: "bamboo", Icon: Sprout },
  { value: "stream", Icon: Droplets },
  { value: "leaf", Icon: Leaf },
] as const

export function CommunityIdentityForm({ profile, returnTo, locale }: CommunityIdentityFormProps) {
  const router = useRouter()
  const inputId = useId()
  const [state, action, pending] = useActionState(saveCommunityProfileAction, INITIAL_STATE)
  const [avatarKind, setAvatarKind] = useState(profile?.avatarKind ?? "default")
  const [presetAvatar, setPresetAvatar] = useState(profile?.presetAvatar ?? "bamboo")
  const [avatarPath, setAvatarPath] = useState(profile?.avatarPath ?? "")
  const [preview, setPreview] = useState(communityAvatarUrl(profile))
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")

  useEffect(() => {
    if (!state.success) return
    if (returnTo?.startsWith("/app/")) router.push(returnTo)
    else router.refresh()
  }, [returnTo, router, state.success])

  async function uploadAvatar(file: File) {
    setUploading(true)
    setUploadError("")
    const formData = new FormData()
    formData.set("kind", "avatar")
    formData.set("file", file)
    try {
      const response = await fetch("/api/community/uploads", { method: "POST", body: formData })
      const result = await response.json() as { storagePath?: string; error?: string }
      if (!response.ok || !result.storagePath) throw new Error(result.error || "上传失败")
      setAvatarPath(result.storagePath)
      setAvatarKind("upload")
      setPreview(URL.createObjectURL(file))
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "上传失败")
    } finally {
      setUploading(false)
    }
  }

  const PresetIcon = PRESETS.find((item) => item.value === presetAvatar)?.Icon

  return (
    <form action={action} className="space-y-4 rounded-2xl bg-card p-4 shadow-soft">
      <input type="hidden" name="avatarKind" value={avatarKind} />
      <input type="hidden" name="presetAvatar" value={presetAvatar} />
      <input type="hidden" name="avatarPath" value={avatarPath} />
      <div className="flex items-center gap-3">
        <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 text-primary">
          {avatarKind === "upload" && preview ? (
            <Image src={preview} alt="" fill unoptimized className="object-cover" sizes="64px" />
          ) : avatarKind === "preset" && PresetIcon ? (
            <PresetIcon className="size-7" />
          ) : <UserRound className="size-7" />}
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="community-nickname" className="mb-1 block text-xs font-medium text-muted-foreground">
            {locale === "ja" ? "ニックネーム" : "社区昵称"}
          </label>
          <input
            id="community-nickname"
            name="nickname"
            defaultValue={profile?.nickname ?? ""}
            required
            minLength={2}
            maxLength={20}
            placeholder={locale === "ja" ? "2〜20文字" : "2–20 个字符"}
            className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{locale === "ja" ? "プロフィール画像" : "社区头像"}</legend>
        <div className="grid grid-cols-5 gap-2">
          <button type="button" onClick={() => setAvatarKind("default")} className={`grid aspect-square place-items-center rounded-xl border ${avatarKind === "default" ? "border-primary bg-primary/10 text-primary" : "border-border"}`} aria-label="默认头像">
            <UserRound className="size-5" />
          </button>
          {PRESETS.map(({ value, Icon }) => (
            <button key={value} type="button" onClick={() => { setAvatarKind("preset"); setPresetAvatar(value) }} className={`grid aspect-square place-items-center rounded-xl border ${avatarKind === "preset" && presetAvatar === value ? "border-primary bg-primary/10 text-primary" : "border-border"}`} aria-label={value}>
              <Icon className="size-5" />
            </button>
          ))}
          <label htmlFor={inputId} className={`grid aspect-square cursor-pointer place-items-center rounded-xl border ${avatarKind === "upload" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
            <Upload className="size-5" />
          </label>
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void uploadAvatar(file)
              event.target.value = ""
            }}
          />
        </div>
      </fieldset>

      {(state.error || uploadError) && <p role="alert" className="text-sm text-destructive">{state.error || uploadError}</p>}
      {state.success && <p role="status" className="text-sm text-primary">{locale === "ja" ? "保存しました" : "社区身份已保存"}</p>}
      <button type="submit" disabled={pending || uploading} className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {pending || uploading ? (locale === "ja" ? "保存中…" : "保存中……") : (locale === "ja" ? "プロフィールを保存" : "保存社区身份")}
      </button>
    </form>
  )
}
