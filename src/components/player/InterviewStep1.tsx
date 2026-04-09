"use client"

import { useTranslations, useLocale } from "next-intl"
import type { PreInterviewFormData, Gender } from "@/types"
import { SingleSelect } from "@/components/shared/SingleSelect"
import { useTagLabels } from "@/lib/i18n/use-tag-labels"
import {
  AGE_RANGE_OPTIONS,
  NATIONALITY_OPTIONS,
  CITY_OPTIONS,
} from "@/lib/constants/tags"

interface Props {
  data: PreInterviewFormData
  onChange: (patch: Partial<PreInterviewFormData>) => void
}

const GENDER_OPTIONS: { value: Gender; label_zh: string; label_ja: string }[] = [
  { value: "male", label_zh: "男", label_ja: "男性" },
  { value: "female", label_zh: "女", label_ja: "女性" },
  { value: "other", label_zh: "其他", label_ja: "その他" },
]

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"

export function InterviewStep1({ data, onChange }: Props) {
  const t = useTranslations("interview")
  const locale = useLocale()
  const ageLabels = useTagLabels(AGE_RANGE_OPTIONS)
  const natLabels = useTagLabels(NATIONALITY_OPTIONS)
  const cityLabels = useTagLabels(CITY_OPTIONS)

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-foreground">{t("fullName")} *</label>
        <input
          className={inputClass}
          value={data.full_name}
          onChange={(e) => onChange({ full_name: e.target.value })}
          placeholder={t("fullNamePlaceholder")}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">{t("nickname")}</label>
        <input
          className={inputClass}
          value={data.nickname}
          onChange={(e) => onChange({ nickname: e.target.value })}
          placeholder={t("nicknamePlaceholder")}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">{t("gender")} *</label>
        <SingleSelect
          options={GENDER_OPTIONS.map((g) => g.value)}
          value={data.gender}
          onChange={(v) => onChange({ gender: v as Gender })}
          labels={Object.fromEntries(GENDER_OPTIONS.map((g) => [g.value, locale === "ja" ? g.label_ja : g.label_zh]))}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">{t("ageRange")} *</label>
        <SingleSelect
          options={[...AGE_RANGE_OPTIONS]}
          value={data.age_range}
          onChange={(v) => onChange({ age_range: v })}
          labels={ageLabels}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">{t("nationality")} *</label>
        <SingleSelect
          options={[...NATIONALITY_OPTIONS]}
          value={data.nationality}
          onChange={(v) => onChange({ nationality: v })}
          labels={natLabels}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">{t("currentCity")} *</label>
        <SingleSelect
          options={[...CITY_OPTIONS]}
          value={data.current_city}
          onChange={(v) => onChange({ current_city: v })}
          labels={cityLabels}
        />
      </div>
    </div>
  )
}
