"use client"

import Image from "next/image"
import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Droplets, Leaf, Sprout, UserRound } from "lucide-react"
import { saveCommunityProfileAction } from "./actions"
import { communityAvatarUrl } from "@/lib/community/media"
import { COMMUNITY_AVATAR_BUCKET } from "@/lib/community/constants"
import type { CommunityActionState, CommunityProfile } from "@/lib/community/types"

const INITIAL_STATE: CommunityActionState = {}

interface CommunityIdentityFormProps {
  profile: CommunityProfile | null
  personalAvatarPath: string | null
  returnTo?: string
  locale: "zh" | "ja"
}

const PRESETS = [
  { value: "bamboo", Icon: Sprout },
  { value: "stream", Icon: Droplets },
  { value: "leaf", Icon: Leaf },
] as const

export function CommunityIdentityForm({ profile, personalAvatarPath, returnTo, locale }: CommunityIdentityFormProps) {
  const router = useRouter()
  const [state, action, pending] = useActionState(saveCommunityProfileAction, INITIAL_STATE)
  const storedAvatarKind = profile?.avatarKind === "upload" ? "personal" : profile?.avatarKind ?? "default"
  const [avatarKind, setAvatarKind] = useState(
    storedAvatarKind === "personal" && !personalAvatarPath ? "default" : storedAvatarKind,
  )
  const [presetAvatar, setPresetAvatar] = useState(profile?.presetAvatar ?? "bamboo")
  const personalAvatarUrl = personalAvatarPath
    ? `/api/community/media?${new URLSearchParams({ bucket: COMMUNITY_AVATAR_BUCKET, path: personalAvatarPath }).toString()}`
    : null
  const currentAvatarUrl = avatarKind === "personal"
    ? personalAvatarUrl
    : communityAvatarUrl(profile)

  useEffect(() => {
    if (!state.success) return
    if (returnTo?.startsWith("/app/")) router.push(returnTo)
    else router.refresh()
  }, [returnTo, router, state.success])

  const PresetIcon = PRESETS.find((item) => item.value === presetAvatar)?.Icon

  return (
    <form action={action} className="space-y-4 rounded-2xl bg-card p-4 shadow-soft">
      <input type="hidden" name="avatarKind" value={avatarKind} />
      <input type="hidden" name="presetAvatar" value={presetAvatar} />
      <div className="flex items-center gap-3">
        <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 text-primary">
          {avatarKind === "personal" && currentAvatarUrl ? (
            <Image src={currentAvatarUrl} alt="" fill unoptimized className="object-cover" sizes="64px" />
          ) : avatarKind === "preset" && PresetIcon ? (
            <PresetIcon className="size-7" />
          ) : <UserRound className="size-7" />}
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="community-nickname" className="mb-1 block text-xs font-medium text-muted-foreground">
            {locale === "ja" ? "ニックネーム" : "昵称"}
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
          <button
            type="button"
            onClick={() => setAvatarKind("personal")}
            disabled={!personalAvatarUrl}
            className={`relative grid aspect-square place-items-center overflow-hidden rounded-xl border disabled:cursor-not-allowed disabled:opacity-35 ${avatarKind === "personal" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
            aria-label={locale === "ja" ? "個人プロフィール画像を使用" : "使用个人资料头像"}
          >
            {personalAvatarUrl ? (
              <Image src={personalAvatarUrl} alt="" fill unoptimized className="object-cover" sizes="64px" />
            ) : (
              <UserRound className="size-5" />
            )}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {personalAvatarUrl
            ? (locale === "ja" ? "右端は個人プロフィール画像です。変更すると自動で同期されます。" : "最右侧使用个人资料头像，今后更换会自动同步。")
            : (locale === "ja" ? "個人プロフィール画像を設定すると、右端から選べます。" : "设置个人资料头像后，即可选择最右侧头像。")}
        </p>
      </fieldset>

      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-primary">{locale === "ja" ? "保存しました" : "社区身份已保存"}</p>}
      <button type="submit" disabled={pending} className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {pending ? (locale === "ja" ? "保存中…" : "保存中……") : (locale === "ja" ? "プロフィールを保存" : "保存社区身份")}
      </button>
    </form>
  )
}
