"use client"

import Link from "next/link"
import { Pencil } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import type { RoundRecord } from "@/types/matching-round"
import { getRoundPurpose } from "@/lib/matching/round-config"
import { canEditParticipation, participationEditHref, participationStatus } from "@/lib/matching/participation-display"
import { formatSurveyTime } from "@/lib/matching/survey-window"
import { useSurveyWindow } from "@/lib/matching/use-survey-window"

export function ParticipationRecordActions({ round, initialNow }: { round: RoundRecord; initialNow: string }) {
  const t = useTranslations("participation")
  const locale = useLocale()
  const state = useSurveyWindow(round, initialNow)
  const editable = canEditParticipation(round, state)
  return <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
    <p className="text-sm font-semibold text-primary" role="status">{t(`status.${participationStatus(round, state)}`)}</p>
    <p className="text-xs leading-5 text-muted-foreground">{editable ? t("editableUntil", { time: formatSurveyTime(round.survey_end, locale) }) : t(state === "scheduled" ? "notOpenHint" : "readOnlyHint")}</p>
    {getRoundPurpose(round.purpose) === "matching" && <p className="text-xs leading-5 text-muted-foreground">{t("matchingHint")}</p>}
    {editable && <Link href={participationEditHref(round.id)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
      <Pencil className="size-3.5" aria-hidden="true" />{t(getRoundPurpose(round.purpose) === "registration" ? "editRegistration" : "editSurvey")}
    </Link>}
  </section>
}
