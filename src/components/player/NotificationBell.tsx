"use client"

import Link from "next/link"
import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Bell, CheckCheck } from "lucide-react"
import {
  markAllCommunityNotificationsReadAction,
  markCommunityNotificationReadAction,
} from "@/app/app/community/actions"
import { CommunityAvatar } from "@/components/community/CommunityAvatar"
import type { CommunityNotification } from "@/lib/community/types"
import { cn } from "@/lib/utils"

interface NotificationBellProps {
  items: CommunityNotification[]
  unreadCount: number
  locale: string
}

function relativeTime(value: string, locale: string) {
  const delta = new Date(value).getTime() - Date.now()
  const minutes = Math.round(delta / 60_000)
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute")
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour")
  return formatter.format(Math.round(hours / 24), "day")
}

export function NotificationBell({ items, unreadCount, locale }: NotificationBellProps) {
  const router = useRouter()
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()

  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), 30_000)
    return () => window.clearInterval(interval)
  }, [router])

  useEffect(() => {
    if (!open) return
    function close(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", escape)
    }
  }, [open])

  function openNotification(notification: CommunityNotification) {
    startTransition(async () => {
      if (!notification.readAt) await markCommunityNotificationReadAction(notification.id)
      setOpen(false)
      if (notification.href) router.push(notification.href)
      else router.push("/app/community/notifications")
    })
  }

  function markAllRead() {
    startTransition(async () => {
      await markAllCommunityNotificationsReadAction()
      router.refresh()
    })
  }

  return (
    <div ref={panelRef} className="relative ml-auto">
      <button
        type="button"
        aria-label={locale.startsWith("ja") ? "通知" : "通知"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 grid min-w-4.5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-[18px] text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-semibold">{locale.startsWith("ja") ? "通知" : "通知"}</h2>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead} className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary">
                <CheckCheck className="size-4" />
                {locale.startsWith("ja") ? "すべて既読" : "全部标为已读"}
              </button>
            )}
          </div>
          <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {locale.startsWith("ja") ? "通知はありません" : "暂时没有通知"}
              </p>
            ) : items.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => openNotification(notification)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-border/70 px-4 py-3 text-left last:border-0 hover:bg-primary/5",
                  !notification.readAt && "bg-primary/8",
                )}
              >
                {notification.actor ? (
                  <CommunityAvatar profile={notification.actor} size="sm" />
                ) : (
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Bell className="size-3.5" /></span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{notification.title}</span>
                  {notification.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{notification.body}</span>}
                  {notification.unavailable && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {locale.startsWith("ja") ? "この内容は利用できません" : "该内容已不可用"}
                    </span>
                  )}
                  <span className="mt-1 block text-[11px] text-muted-foreground">{relativeTime(notification.createdAt, locale)}</span>
                </span>
                {!notification.readAt && <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" aria-label={locale.startsWith("ja") ? "未読" : "未读"} />}
              </button>
            ))}
          </div>
          <Link href="/app/community/notifications" onClick={() => setOpen(false)} className="block min-h-11 border-t border-border px-4 py-3 text-center text-sm font-semibold text-primary">
            {locale.startsWith("ja") ? "すべて見る" : "查看全部"}
          </Link>
        </div>
      )}
    </div>
  )
}
