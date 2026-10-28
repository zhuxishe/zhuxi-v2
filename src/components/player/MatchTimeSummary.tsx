"use client"

import { Fragment, useId, useState } from "react"
import { CalendarDays, ChevronDown, ChevronUp, Clock3 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { formatPublishedMatchDate, formatPublishedMatchSlot } from "@/lib/matching/publication-display"
import type { PlayerSharedAvailability } from "@/lib/matching/player-shared-availability"
import { cn } from "@/lib/utils"

interface Props {
  today?: string
  recommendedTime?: string
  recommendedSlot?: string | null
  sharedAvailability?: PlayerSharedAvailability | null
}
const PERIODS = ["上午", "下午", "晚上"] as const
const INITIAL_DATES = 3

export function MatchTimeSummary({ today, recommendedTime, recommendedSlot, sharedAvailability }: Props) {
  const t = useTranslations("playerMatches")
  const locale = useLocale()
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const ready = sharedAvailability?.status === "ready"
  const byDate = new Map<string, Set<string>>()
  for (const slot of ready ? sharedAvailability.slots : []) {
    const match = /^(\d{4}-\d{2}-\d{2})_(上午|下午|晚上)$/.exec(slot)
    if (!match || !formatPublishedMatchDate(match[1], locale)) continue
    const periods = byDate.get(match[1]) ?? new Set<string>()
    periods.add(match[2]); byDate.set(match[1], periods)
  }
  const dates = [...byDate.keys()].sort()
  const validToday = today && formatPublishedMatchDate(today, locale) ? today : undefined
  const upcomingDates = dates.filter((date) => !validToday || date >= validToday)
  const pastDates = dates.filter((date) => validToday && date < validToday)
  const visibleDates = expanded ? [...upcomingDates, ...pastDates] : (upcomingDates.length ? upcomingDates : pastDates).slice(0, INITIAL_DATES)
  const canExpand = visibleDates.length < dates.length || expanded
  const count = [...byDate.values()].reduce((total, periods) => total + periods.size, 0)
  const recommendationKey = recommendedSlot?.replace(" ", "_")
  const normalizedRecommendation = recommendationKey && formatPublishedMatchSlot(recommendationKey, locale) ? recommendationKey : null
  const recommendationPast = !!validToday && !!normalizedRecommendation && normalizedRecommendation.slice(0, 10) < validToday
  const recommendationChanged = ready && count > 0 && normalizedRecommendation
    && !sharedAvailability.slots.includes(normalizedRecommendation)
  const periodLabels = { 上午: t("sharedTimeMorning"), 下午: t("sharedTimeAfternoon"), 晚上: t("sharedTimeEvening") }

  return <section aria-label={t("timeArrangement")} className="space-y-4">
    {recommendedTime && <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/[0.045] p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><CalendarDays aria-hidden="true" className="size-4" /></span>
      <div className="min-w-0"><h3 className="text-xs font-medium text-muted-foreground">{t("recommendedTime")}{recommendationPast && <span className="ml-2 font-normal">· {t("sharedTimesPast")}</span>}</h3><p className="mt-1 text-sm font-semibold leading-relaxed text-foreground">{recommendedTime}</p></div>
    </div>}
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="flex items-center gap-1.5 text-sm font-medium"><Clock3 aria-hidden="true" className="size-3.5 text-muted-foreground" />{t("sharedTimesTitle")}</h3>
        <span className="text-[11px] text-muted-foreground">{t("sharedTimeZone")}{ready && count > 0 && ` · ${t("sharedTimesCount", { count })}`}</span>
      </div>
      {!ready ? <p className="rounded-lg bg-muted/30 px-3 py-3 text-xs leading-relaxed text-muted-foreground">{t("sharedTimesUnavailable")}</p>
        : !dates.length ? <p className="rounded-lg bg-muted/30 px-3 py-3 text-xs leading-relaxed text-muted-foreground">{t("sharedTimesEmpty")}</p>
          : <>
            <div id={listId} className="divide-y divide-border/60 rounded-xl border border-border/70 px-3">
              {visibleDates.map((date) => <Fragment key={date}>{date === pastDates[0] && <p className="pt-3 pb-1 text-[11px] text-muted-foreground">{t("sharedTimesPast")}</p>}<div data-shared-date={date} className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3", validToday && date < validToday && "text-muted-foreground")}>
                <time dateTime={date} className="text-xs font-medium tabular-nums">{formatPublishedMatchDate(date, locale)}</time>
                <div className="flex flex-wrap gap-1.5">{PERIODS.filter((period) => byDate.get(date)!.has(period)).map((period) => {
                  const slot = `${date}_${period}`
                  const recommended = slot === normalizedRecommendation
                  return <span key={period} data-shared-slot={slot} data-recommended-slot={recommended ? slot : undefined} className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs", recommended && !(validToday && date < validToday) ? "bg-primary/10 font-medium text-primary" : "bg-muted/50 text-muted-foreground")}>{periodLabels[period]}{recommended && <span className="text-[10px]">· {t("sharedTimeRecommended")}</span>}</span>
                })}</div>
              </div></Fragment>)}
            </div>
            {canExpand && <button type="button" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded((value) => !value)} className="flex min-h-10 w-full items-center justify-center gap-1 rounded-lg text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
              {expanded ? t("sharedTimesCollapse") : t("sharedTimesExpand", { count: dates.length })}{expanded ? <ChevronUp aria-hidden="true" className="size-3.5" /> : <ChevronDown aria-hidden="true" className="size-3.5" />}
            </button>}
          </>}
      {recommendationChanged && <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">{t("sharedTimeRecommendationChanged")}</p>}
      <p className="text-[11px] leading-relaxed text-muted-foreground">{t("sharedTimesHint")}</p>
    </div>
  </section>
}
