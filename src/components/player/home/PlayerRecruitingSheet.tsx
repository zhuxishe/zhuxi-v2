"use client"

import Link from "next/link"
import { CalendarDays, ChevronRight, MapPin, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import type { PlayerHomeActivityItem } from "./types"

interface Props {
  activities: PlayerHomeActivityItem[]
  locale: string
  labels: {
    title: string
    description: string
    empty: string
    viewAll: string
    datePending: string
    locationPending: string
    close: string
  }
  onClose: () => void
}

export function PlayerRecruitingSheet({ activities, locale, labels, onClose }: Props) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="bottom-0 top-auto max-h-[calc(100dvh-0.5rem)] w-full max-w-md translate-y-0 overflow-y-auto overscroll-contain rounded-b-none rounded-t-[28px] bg-card px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 sm:max-w-md"
      >
        <span className="mx-auto block h-1 w-10 rounded-full bg-border" />
        <div className="mt-3 flex items-start justify-between gap-3">
          <div>
            <DialogTitle className="text-lg font-semibold">{labels.title}</DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-5">{labels.description}</DialogDescription>
          </div>
          <button type="button" onClick={onClose} aria-label={labels.close} className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-3 divide-y divide-border border-y border-border">
          {activities.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{labels.empty}</p>
          ) : activities.slice(0, 3).map((activity) => (
            <Link key={activity.id} href={`/app/scripts/large/${activity.id}`} onClick={onClose} className="flex min-h-20 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><CalendarDays className="size-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm font-semibold">{activity.title}</strong>
                <span className="mt-1 flex min-w-0 items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="truncate">{formatDate(activity, locale, labels.datePending)}</span>
                  <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="size-3 shrink-0" aria-hidden="true" /><span className="truncate">{activity.location ?? labels.locationPending}</span></span>
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          ))}
        </div>

        <Link href="/app/scripts/large" onClick={onClose} className="mt-4 flex min-h-11 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
          {labels.viewAll}
        </Link>
      </DialogContent>
    </Dialog>
  )
}

function formatDate(activity: PlayerHomeActivityItem, locale: string, fallback: string) {
  const value = activity.startAt ?? activity.eventDate
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "zh-CN", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date)
}
