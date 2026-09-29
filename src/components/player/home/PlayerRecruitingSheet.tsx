"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { CalendarDays, ChevronRight, MapPin, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { getSurveyWindowState } from "@/lib/matching/survey-window"
import { PlayerRecruitingRoundEntry } from "./PlayerRecruitingRoundEntry"
import type { PlayerHomeActivityItem, PlayerHomeRoundItem } from "./types"

interface Props {
  activities: PlayerHomeActivityItem[]
  rounds: PlayerHomeRoundItem[]
  initialNow: string
  locale: string
  labels: {
    title: string
    description: string
    empty: string
    viewAll: string
    roundsTitle: string
    announcementsTitle: string
    activitiesTitle: string
    viewRounds: string
    datePending: string
    locationPending: string
    close: string
  }
  onClose: () => void
}

export function PlayerRecruitingSheet({ activities, rounds, initialNow, locale, labels, onClose }: Props) {
  const [now, setNow] = useState(() => new Date(initialNow))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    function sync() {
      clearTimeout(timer)
      const current = new Date()
      setNow(current)
      const boundaries = rounds.flatMap((round) => [Date.parse(round.survey_start), Date.parse(round.survey_end)]).filter((time) => time > current.getTime())
      timer = setTimeout(sync, Math.min(60_000, ...boundaries.map((time) => time - current.getTime() + 1)))
    }
    timer = setTimeout(sync, 0)
    window.addEventListener("focus", sync)
    document.addEventListener("visibilitychange", sync)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("focus", sync)
      document.removeEventListener("visibilitychange", sync)
    }
  }, [rounds])
  const available = rounds.filter((round) => getSurveyWindowState(round, now) === "open")
  const participation = available.filter((round) => round.purpose !== "announcement")
  const announcements = available.filter((round) => round.purpose === "announcement")

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

        {available.length === 0 && activities.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{labels.empty}</p>}
        {participation.length > 0 && <section className="mt-5" aria-labelledby="recruiting-rounds-title">
          <h2 id="recruiting-rounds-title" className="mb-3 text-sm font-semibold">{labels.roundsTitle}</h2>
          <div className="space-y-3">{participation.map((round) => <PlayerRecruitingRoundEntry key={round.id} round={round} locale={locale} onClose={onClose} />)}</div>
        </section>}
        {announcements.length > 0 && <section className="mt-5" aria-labelledby="recruiting-announcements-title">
          <h2 id="recruiting-announcements-title" className="mb-3 text-sm font-semibold">{labels.announcementsTitle}</h2>
          <div className="space-y-3">{announcements.map((round) => <PlayerRecruitingRoundEntry key={round.id} round={round} locale={locale} onClose={onClose} />)}</div>
        </section>}
        {activities.length > 0 && <section className="mt-5" aria-labelledby="recruiting-activities-title">
          <h2 id="recruiting-activities-title" className="mb-2 text-sm font-semibold">{labels.activitiesTitle}</h2>
          <div className="divide-y divide-border border-y border-border">
            {activities.slice(0, 3).map((activity) => (
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
        </section>}

        <Link href="/app/matching" onClick={onClose} className="mt-4 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-primary/20 px-4 text-sm font-semibold text-primary hover:bg-primary/5">
          {labels.viewRounds}<ChevronRight className="size-4" aria-hidden="true" />
        </Link>
        <Link href="/app/scripts/large" onClick={onClose} className="flex min-h-11 items-center justify-between gap-3 px-4 text-sm text-muted-foreground">
          {labels.viewAll}
          <ChevronRight className="size-4" aria-hidden="true" />
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
