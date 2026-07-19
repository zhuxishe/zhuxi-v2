import Image from "next/image"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { rewriteStorageUrl } from "@/lib/storage-url"
import { hasExplicitLargeActivityStartTime } from "@/lib/player-activity/selection"
import type { PlayerHomeActivityItem } from "./types"

interface Props {
  activity: PlayerHomeActivityItem | null
  locale: string
  labels: {
    title: string
    badge: string
    viewAll: string
    viewDetail: string
    datePending: string
    locationPending: string
  }
}

export function PlayerHomeFeaturedActivity({ activity, locale, labels }: Props) {
  if (!activity) return null
  const cover = rewriteStorageUrl(activity.coverUrl)
    ?? "/images/landing/mobile-redesign/activity-large-bg.webp"

  return (
    <section aria-labelledby="player-home-featured-title">
      <h2 id="player-home-featured-title" className="text-base font-semibold leading-6 tracking-tight">{labels.title}</h2>
      <Link
        href={`/app/scripts/large/${activity.id}`}
        className="group mt-1 grid h-[110px] grid-cols-[49%_51%] overflow-hidden rounded-[10px] border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="relative overflow-hidden bg-muted">
          <Image src={cover} alt="" fill sizes="11rem" className="object-cover transition duration-500 group-hover:scale-[1.025] motion-reduce:transition-none" />
        </span>
        <span className="flex min-w-0 flex-col justify-center px-[15px] py-2.5">
          <span className="w-fit rounded-md bg-primary/10 px-2 py-1 text-[10px] font-semibold leading-3 text-primary">{labels.badge}</span>
          <strong className="mt-1.5 truncate text-base font-semibold leading-5 tracking-tight">{activity.title}</strong>
          <span className="mt-1 truncate text-[11px] leading-4 text-muted-foreground">
            {formatSchedule(activity, locale, labels.datePending)} · {activity.location ?? labels.locationPending}
          </span>
          <span className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-semibold leading-4 text-primary">
            {labels.viewDetail}<ChevronRight className="size-3.5" aria-hidden="true" />
          </span>
        </span>
      </Link>
    </section>
  )
}

function formatSchedule(activity: PlayerHomeActivityItem, locale: string, fallback: string) {
  const value = activity.startAt ?? activity.eventDate
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  const hasTime = hasExplicitLargeActivityStartTime(activity)
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "zh-CN", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    ...(hasTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date)
}
