"use client"

import { useActionState } from "react"
import { saveCommunityNotificationPreferencesAction } from "./actions"
import type { CommunityNotificationPreferences } from "@/lib/community/queries/me"
import type { CommunityActionState } from "@/lib/community/types"

const INITIAL_STATE: CommunityActionState = {}

export function NotificationPreferencesForm({
  preferences,
  locale,
}: {
  preferences: CommunityNotificationPreferences
  locale: "zh" | "ja"
}) {
  const [state, action, pending] = useActionState(saveCommunityNotificationPreferencesAction, INITIAL_STATE)
  const options = [
    ["likes", locale === "ja" ? "いいね通知" : "点赞通知", preferences.likesEnabled],
    ["comments", locale === "ja" ? "コメント通知" : "评论通知", preferences.commentsEnabled],
    ["replies", locale === "ja" ? "返信通知" : "回复通知", preferences.repliesEnabled],
    ["announcements", locale === "ja" ? "新しいお知らせ" : "新公告通知", preferences.announcementsEnabled],
  ] as const

  return (
    <form action={action} className="space-y-2">
      {options.map(([name, label, checked]) => (
        <label key={name} className="flex min-h-12 items-center justify-between rounded-xl border border-border bg-background px-3 text-sm">
          <span>{label}</span>
          <input name={name} type="checkbox" defaultChecked={checked} className="size-5 accent-primary" />
        </label>
      ))}
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-primary">{locale === "ja" ? "保存しました" : "通知设置已保存"}</p>}
      <button type="submit" disabled={pending} className="min-h-11 w-full rounded-xl border border-primary px-4 text-sm font-semibold text-primary disabled:opacity-50">
        {locale === "ja" ? "通知設定を保存" : "保存通知设置"}
      </button>
    </form>
  )
}
