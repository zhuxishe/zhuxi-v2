"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { ArrowRight, CalendarDays, ClipboardList, MapPin, Megaphone } from "lucide-react"
import { formatSurveyTime } from "@/lib/matching/survey-window"
import { roundHref } from "@/lib/matching/round-display"
import type { PlayerHomeRoundItem } from "./types"

export function PlayerRecruitingRoundEntry({ round, locale, onClose }: { round: PlayerHomeRoundItem; locale: string; onClose: () => void }) {
  const t = useTranslations("playerHome.recruiting")
  const roundT = useTranslations("rounds")
  const Icon = round.purpose === "matching" ? ClipboardList : round.purpose === "registration" ? CalendarDays : Megaphone
  const submitted = round.submitted && round.purpose !== "announcement"
  const href = submitted ? `/app/profile/stats/rounds/${round.id}` : roundHref(round.id)

  return (
    <Link href={href} onClick={onClose} className="block rounded-2xl border border-primary/15 bg-primary/[0.035] p-4 transition-colors hover:bg-primary/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <span className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 text-primary"><Icon className="size-4" aria-hidden="true" />{t(round.purpose)}</span>
        {submitted && <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">{t(round.purpose === "registration" ? "registered" : "submitted")}</span>}
      </span>
      <strong className="mt-2 block break-words text-base font-semibold leading-6">{round.title}</strong>
      {round.eventStart && <span className="mt-2 block text-xs leading-5 text-muted-foreground">{t("eventTime", { time: formatSurveyTime(round.eventStart, locale) })}</span>}
      {round.location && <span className="mt-1 flex items-start gap-1 text-xs leading-5 text-muted-foreground"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{round.location}</span>}
      <span className="mt-2 block text-xs leading-5 text-muted-foreground">{roundT(round.purpose === "announcement" ? "displayEnd" : "deadline", { time: formatSurveyTime(round.survey_end, locale) })}</span>
      <span className="mt-3 flex items-center justify-between border-t border-primary/10 pt-3 text-sm font-semibold text-primary">
        {submitted ? t("viewRecord") : roundT(`cta.${round.purpose}`)}
        <ArrowRight className="size-4" aria-hidden="true" />
      </span>
    </Link>
  )
}
