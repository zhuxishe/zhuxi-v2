"use client"

import Link from "next/link"
import { CalendarDays, ChevronRight, ClipboardCheck, MapPin, Pencil } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import type { PlayerParticipationRecord } from "@/types/player-participation"
import { getRoundPurpose, localizeRoundText, normalizeRoundConfig } from "@/lib/matching/round-config"
import { roundDisplayName } from "@/lib/matching/round-display"
import { canEditParticipation, canReregisterParticipation, isRegistrationCancelled, participationEditHref, participationRecordHref, participationStatus } from "@/lib/matching/participation-display"
import { formatSurveyTime } from "@/lib/matching/survey-window"
import { useSurveyWindow } from "@/lib/matching/use-survey-window"
import { formatTokyoDateTimeRange } from "@/lib/player-activity/tokyo-datetime"
import type { ActivityReviewRound } from "@/lib/activity-reviews/types"
import { ActivityReviewEntry } from "../activity-reviews/ActivityReviewEntry"

export function PlayerParticipationCard({ record, initialNow, reviewRound }: { record: PlayerParticipationRecord; initialNow: string; reviewRound?: ActivityReviewRound }) {
  const t = useTranslations("participation")
  const locale = useLocale()
  const { round } = record
  const state = useSurveyWindow(round, initialNow)
  const editable = canEditParticipation(round, state, record.cancelled_at)
  const cancelled = isRegistrationCancelled(round, record.cancelled_at)
  const canReregister = canReregisterParticipation(round, state, record.cancelled_at)
  const purpose = getRoundPurpose(round.purpose)
  const config = normalizeRoundConfig(round.content_config)
  const location = localizeRoundText(config.location, locale)
  const activityTime = config.eventStart
    ? formatTokyoDateTimeRange(config.eventStart, config.eventEnd || null, locale, "")
    : purpose === "matching" ? `${round.activity_start} – ${round.activity_end}` : ""

  return <article className="overflow-hidden rounded-2xl border border-border bg-card">
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><ClipboardCheck className="size-3.5" aria-hidden="true" />{t(`purpose.${purpose}`)}</span>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${state === "open" && !cancelled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{t(`status.${participationStatus(round, state, record.cancelled_at)}`)}</span>
      </div>
      <h3 className="mt-3 break-words text-base font-semibold leading-6 tracking-tight">{roundDisplayName(round, locale)}</h3>
      {(activityTime || location) && <div className="mt-2.5 space-y-1.5 text-xs leading-5 text-muted-foreground">
        {activityTime && <p className="flex items-start gap-2"><CalendarDays className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /><span>{activityTime}</span></p>}
        {location && <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /><span className="break-words">{location}</span></p>}
      </div>}
      <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{cancelled ? t("cancelledAt", { time: formatSurveyTime(record.cancelled_at!, locale) }) : editable ? t("editableUntil", { time: formatSurveyTime(round.survey_end, locale) }) : t(state === "open" && purpose === "registration" ? "registrationConfirmed" : "readOnlyShort")}</p>
    </div>
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/70 bg-muted/25 px-4 py-2.5">
      {reviewRound && <ActivityReviewEntry round={reviewRound} locale={locale} compact />}
      <Link href={participationRecordHref(round.id)} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {t("viewRecord")}<ChevronRight className="size-3.5" aria-hidden="true" />
      </Link>
      {(editable || canReregister) && <Link href={participationEditHref(round.id)} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
        <Pencil className="size-3" aria-hidden="true" />{t(canReregister ? "reregister" : purpose === "registration" ? "editRegistration" : "editSurvey")}
      </Link>}
    </div>
  </article>
}
