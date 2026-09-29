"use client"

import { useLocale, useTranslations } from "next-intl"
import { localizeRoundText } from "@/lib/matching/round-config"
import { formatSurveyTime } from "@/lib/matching/survey-window"
import type { RoundContentConfig, RoundPurpose } from "@/types/matching-round"

interface Props {
  roundName: string
  purpose: RoundPurpose
  config: RoundContentConfig
  surveyEnd: string
}

/** Plain text content deliberately avoids treating administrator text as HTML. */
export function RoundDetails({ roundName, purpose, config, surveyEnd }: Props) {
  const t = useTranslations("survey")
  const locale = useLocale()
  const introduction = localizeRoundText(config.introduction, locale)
  const details = (["location", "fee", "notice"] as const)
    .map((key) => ({ key, value: localizeRoundText(config[key], locale) })).filter((item) => item.value)
  return (
    <div className="space-y-5">
      <div className="text-center">
        <h1 className="heading-display break-words text-xl">{locale === "ja" && config.titleJa.trim() ? config.titleJa : roundName}</h1>
        {purpose !== "announcement" && <p className="mt-1.5 text-xs tracking-wide text-muted-foreground">
          {purpose === "matching" ? t("heading") : t("registration.heading")}
        </p>}
        <p className="mt-2 text-xs text-muted-foreground">
          {t(purpose === "announcement" ? "displayUntil" : "deadline", { time: formatSurveyTime(surveyEnd, locale) })}
        </p>
      </div>
      {introduction && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{introduction}</p>}
      {(config.eventStart || details.length > 0) && <dl className="space-y-4 rounded-xl border border-border bg-card p-4 text-sm">
        {config.eventStart && <div>
          <dt className="font-semibold">{t("details.time")}</dt>
          <dd className="mt-1 text-muted-foreground">{formatSurveyTime(config.eventStart, locale)}
            {config.eventEnd && ` – ${formatSurveyTime(config.eventEnd, locale)}`}
          </dd>
        </div>}
        {details.map(({ key, value }) => <div key={key}>
          <dt className="font-semibold">{t(`details.${key}`)}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{value}</dd>
        </div>)}
      </dl>}
      {purpose === "announcement" && <p className="text-sm text-muted-foreground">{t("announcementHint")}</p>}
    </div>
  )
}
