"use client"

import { useLocale, useTranslations } from "next-intl"
import { localizeRoundText } from "@/lib/matching/round-config"
import type { RoundContentConfig, SurveyAnswers } from "@/types/matching-round"

const GAME_TYPES = ["双人", "多人", "都可以"] as const
const GENDERS = ["男", "女", "都可以"] as const

interface Props {
  config: RoundContentConfig
  value: SurveyAnswers
  onChange: (value: SurveyAnswers) => void
}

export function SurveyPreferences({ config, value, onChange }: Props) {
  const t = useTranslations("survey")
  const locale = useLocale()
  return (
    <>
      <section className="space-y-3">
        <h2 className="heading-display text-sm">{localizeRoundText(config.labels.gameType, locale, t("gameType.title"))}</h2>
        <div className="grid grid-cols-3 gap-2">
          {(["duo", "multi", "either"] as const).map((key, i) => (
            <button key={key} type="button" aria-pressed={value.gameTypePref === GAME_TYPES[i]}
              onClick={() => onChange({ ...value, gameTypePref: GAME_TYPES[i] })}
              className={`rounded-xl p-3 text-center transition-all shadow-soft ${value.gameTypePref === GAME_TYPES[i]
                ? "bg-primary text-primary-foreground shadow-soft-lg" : "bg-card hover:bg-accent"}`}>
              <p className="text-sm font-semibold">{t(`gameType.${key}.label`)}</p>
              <p className={`mt-0.5 text-[10px] ${value.gameTypePref === GAME_TYPES[i] ? "text-primary-foreground/90" : "text-muted-foreground"}`}>
                {t(`gameType.${key}.desc`)}
              </p>
            </button>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="heading-display text-sm">{localizeRoundText(config.labels.genderPref, locale, t("gender.title"))}</h2>
        <div className="grid grid-cols-3 gap-2">
          {(["male", "female", "either"] as const).map((key, i) => (
            <button key={key} type="button" aria-pressed={value.genderPref === GENDERS[i]}
              onClick={() => onChange({ ...value, genderPref: GENDERS[i] })}
              className={`rounded-xl py-3 text-center text-sm font-medium transition-all shadow-soft ${value.genderPref === GENDERS[i]
                ? "bg-primary text-primary-foreground shadow-soft-lg" : "bg-card hover:bg-accent"}`}>
              {t(`gender.${key}`)}
            </button>
          ))}
        </div>
      </section>
    </>
  )
}
