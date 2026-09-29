"use client"

import { useLocale, useTranslations } from "next-intl"
import { MultiTagSelect } from "@/components/shared/MultiTagSelect"
import { SCRIPT_GENRE_OPTIONS } from "@/lib/constants/scripts"
import { useTagLabels } from "@/lib/i18n/use-tag-labels"
import { localizeRoundText } from "@/lib/matching/round-config"
import type { RoundContentConfig, SurveyAnswers } from "@/types/matching-round"

const SOCIAL_KEYS = ["slowWarm", "active", "listener", "wideTopics", "gentle", "competitive"] as const
const SOCIAL_VALUES = ["慢热", "活跃", "善于倾听", "话题广", "温和", "喜欢竞技"]

interface Props {
  config: RoundContentConfig
  value: SurveyAnswers
  onChange: (value: SurveyAnswers) => void
}

export function SurveyOptionalFields({ config, value, onChange }: Props) {
  const t = useTranslations("survey")
  const locale = useLocale()
  const genreLabels = useTagLabels(SCRIPT_GENRE_OPTIONS)
  return (
    <>
      {config.modules.interests && <section className="space-y-3">
        <h2 className="heading-display text-sm">{localizeRoundText(config.labels.interestTags, locale, t("interestTags"))}</h2>
        <MultiTagSelect options={[...SCRIPT_GENRE_OPTIONS]} value={value.interestTags} labels={genreLabels}
          onChange={(interestTags) => onChange({ ...value, interestTags })} />
      </section>}
      {config.modules.social && <section className="space-y-3">
        <h2 className="heading-display text-sm">{localizeRoundText(config.labels.socialStyle, locale, t("socialStyle.title"))}</h2>
        <div className="flex flex-wrap gap-2">
          {SOCIAL_KEYS.map((key, i) => (
            <button key={key} type="button" aria-pressed={value.socialStyle === SOCIAL_VALUES[i]}
              onClick={() => onChange({ ...value, socialStyle: value.socialStyle === SOCIAL_VALUES[i] ? null : SOCIAL_VALUES[i] })}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${value.socialStyle === SOCIAL_VALUES[i]
                ? "bg-sakura text-white shadow-sm" : "bg-muted hover:bg-accent text-muted-foreground"}`}>
              {t(`socialStyle.${key}`)}
            </button>
          ))}
        </div>
      </section>}
      {config.modules.message && <section className="space-y-3">
        <label htmlFor="survey-message" className="heading-display block text-sm">
          {localizeRoundText(config.labels.message, locale, t("message.title"))}
        </label>
        <textarea id="survey-message" value={value.message ?? ""} maxLength={2000}
          onChange={(event) => onChange({ ...value, message: event.target.value })}
          placeholder={t("message.placeholder")} rows={3}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
      </section>}
    </>
  )
}
