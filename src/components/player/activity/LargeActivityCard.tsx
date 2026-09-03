import Image from "next/image"
import Link from "next/link"
import { CalendarDays, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { rewriteStorageUrl } from "@/lib/storage-url"
import { isUpcomingLargeActivity } from "@/lib/player-activity/selection"
import type { LargeActivitySummary } from "@/lib/player-activity/types"

interface LargeActivityCardLabels {
  upcoming: string
  latest: string
  cancelled: string
  datePending: string
  locationPending: string
}

interface LargeActivityCardProps {
  activity: LargeActivitySummary
  labels: LargeActivityCardLabels
  locale: string
  compact?: boolean
  priority?: boolean
}

export function LargeActivityCard({
  activity,
  labels,
  locale,
  compact = false,
  priority = false,
}: LargeActivityCardProps) {
  const cover = rewriteStorageUrl(activity.coverUrl)
    ?? "/images/landing/mobile-redesign/activity-large-bg.webp"
  const badge = activity.status === "cancelled"
    ? labels.cancelled
    : isUpcomingLargeActivity(activity) ? labels.upcoming : labels.latest

  return (
    <Link
      href={`/app/scripts/large/${activity.id}`}
      className={cn(
        "group relative block overflow-hidden border border-white/40 bg-ink shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        compact ? "min-h-[8.25rem] rounded-[20px]" : "min-h-[11.5rem] rounded-[22px]",
      )}
    >
      <Image
        src={cover}
        alt=""
        fill
        unoptimized={cover.startsWith("https://")}
        priority={priority}
        sizes="(min-width: 448px) 416px, calc(100vw - 32px)"
        className={cn(
          "object-cover transition duration-500 group-hover:scale-[1.025] motion-reduce:transition-none",
          activity.status === "cancelled" && "grayscale-[35%]",
        )}
      />
      <span className="absolute inset-0 bg-gradient-to-b from-black/8 via-black/20 to-black/82" />
      <span className={cn("absolute inset-x-0 bottom-0 text-white", compact ? "p-3.5" : "p-4")}>
        <span className={cn("block pr-24 heading-display font-semibold leading-tight drop-shadow-sm", compact ? "text-[1.35rem]" : "text-[1.55rem]")}>
          {activity.title}
        </span>
        <span className={cn("flex min-w-0 items-center gap-3 text-[13px] font-medium text-white/92", compact ? "mt-1.5" : "mt-2")}>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{formatActivityDate(activity, locale, labels.datePending)}</span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{activity.location ?? labels.locationPending}</span>
          </span>
        </span>
      </span>
      <span className={cn(
        "absolute rounded-full border px-3 py-1.5 text-xs font-semibold backdrop-blur-md",
        compact ? "bottom-3.5 right-3.5" : "bottom-4 right-4",
        activity.status === "cancelled"
          ? "border-white/35 bg-black/45 text-white/90"
          : "border-white/65 bg-white/92 text-primary",
      )}>
        {badge}
      </span>
    </Link>
  )
}

export function formatActivityDate(
  activity: LargeActivitySummary,
  locale: string,
  fallback: string,
) {
  const raw = activity.startAt ?? activity.eventDate
  if (!raw) return fallback
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return fallback
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "zh-CN", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
  }).format(date)
}
