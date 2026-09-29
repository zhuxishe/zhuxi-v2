"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { useSurveyWindow } from "@/lib/matching/use-survey-window"
import { formatSurveyTime } from "@/lib/matching/survey-window"
import { getRoundPurpose } from "@/lib/matching/round-config"
import { roundCardCopy, roundDisplayName, roundHref } from "@/lib/matching/round-display"
import type { RoundRecord } from "@/types/matching-round"

export function PlayerRoundEntry({ round, locale, initialNow, submitted }: { round: RoundRecord; locale: string; initialNow: string; submitted: boolean }) {
  const t = useTranslations("rounds")
  const purpose = getRoundPurpose(round.purpose)
  const state = useSurveyWindow(round, initialNow)
  const copy = roundCardCopy(round, locale, { title: roundDisplayName(round, locale), description: t(`description.${purpose}`), cta: t(`cta.${purpose}`) })
  return <article className="rounded-2xl border border-border bg-card p-5 shadow-soft">
    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{t(`purpose.${purpose}`)}</span><span>{state !== "open" ? t("closed") : submitted ? t("submitted") : t("open")}</span></div>
    <h2 className="mt-3 text-lg font-semibold">{copy.title}</h2>
    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{copy.description}</p>
    <p className="mt-3 text-xs text-muted-foreground">{t(purpose === "announcement" ? "displayEnd" : "deadline", { time: formatSurveyTime(round.survey_end, locale) })}</p>
    {state === "open" ? <Link href={roundHref(round.id)} className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{submitted ? t("edit") : copy.cta}</Link>
      : <p className="mt-4 text-sm text-muted-foreground">{t("closedHint")}</p>}
  </article>
}
