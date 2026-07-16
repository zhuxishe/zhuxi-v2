"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { Bell, CheckCheck } from "lucide-react"
import {
  markAllCommunityNotificationsReadAction,
  markCommunityNotificationReadAction,
} from "@/app/app/community/actions"
import { CommunityAvatar } from "@/components/community/CommunityAvatar"
import type { CommunityNotification } from "@/lib/community/types"

export function CommunityNotificationList({ items, locale }: { items: CommunityNotification[]; locale: "zh" | "ja" }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const label = (zh: string, ja: string) => locale === "ja" ? ja : zh

  function open(item: CommunityNotification) {
    startTransition(async () => {
      if (!item.readAt) await markCommunityNotificationReadAction(item.id)
      if (item.href) router.push(item.href)
      else router.refresh()
    })
  }

  function markAll() {
    startTransition(async () => {
      await markAllCommunityNotificationsReadAction()
      router.refresh()
    })
  }

  return (
    <div>
      <button type="button" onClick={markAll} className="mb-3 ml-auto flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary"><CheckCheck className="size-4" />{label("全部标为已读", "すべて既読にする")}</button>
      {items.length ? (
        <div className="space-y-2">
          {items.map((item) => (
            <button key={item.id} type="button" onClick={() => open(item)} className={`flex min-h-18 w-full items-start gap-3 rounded-2xl p-3 text-left shadow-soft ${item.readAt ? "bg-card" : "bg-primary/8"}`}>
              {item.actor ? <CommunityAvatar profile={item.actor} size="md" /> : <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Bell className="size-4" /></span>}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{item.title}</span>
                {item.body && <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">{item.body}</span>}
                {item.unavailable && <span className="mt-1 block text-xs text-muted-foreground">{label("该内容已不可用", "この内容は利用できません")}</span>}
                <span className="mt-1 block text-[11px] text-muted-foreground">{relativeNotificationTime(item.createdAt, locale)}</span>
              </span>
              {!item.readAt && <span className="mt-1 size-2 rounded-full bg-primary" aria-label={label("未读", "未読")} />}
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-card px-4 py-10 text-center shadow-soft"><Bell className="mx-auto size-6 text-primary" /><p className="mt-3 text-sm text-muted-foreground">{label("暂时没有通知", "通知はありません")}</p></div>
      )}
      <Link href="/app/profile/community" className="mt-4 flex min-h-11 items-center justify-center rounded-xl border border-border bg-card text-sm font-semibold text-primary">{label("通知设置", "通知設定")}</Link>
    </div>
  )
}

function relativeNotificationTime(value: string, locale: "zh" | "ja") {
  const deltaMinutes = Math.round((new Date(value).getTime() - Date.now()) / 60_000)
  const formatter = new Intl.RelativeTimeFormat(locale === "ja" ? "ja-JP" : "zh-CN", { numeric: "auto" })
  if (Math.abs(deltaMinutes) < 60) return formatter.format(deltaMinutes, "minute")
  const hours = Math.round(deltaMinutes / 60)
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour")
  return formatter.format(Math.round(hours / 24), "day")
}
