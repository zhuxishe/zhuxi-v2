"use client"

import { useTranslations } from "next-intl"
import type { PreInterviewFormData, Gender } from "@/types"
import { SingleSelect } from "@/components/shared/SingleSelect"
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
          options={GENDER_OPTIONS.map((g) => g.label_zh)}
          value={GENDER_OPTIONS.find((g) => g.value === data.gender)?.label_zh ?? ""}
          onChange={(label) => {
            const g = GENDER_OPTIONS.find((o) => o.label_zh === label)
            if (g) onChange({ gender: g.value })
          }}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">{t("ageRange")} *</label>
        <SingleSelect
          options={[...AGE_RANGE_OPTIONS]}
          value={data.age_range}
          onChange={(v) => onChange({ age_range: v })}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">{t("nationality")} *</label>
        <SingleSelect
          options={[...NATIONALITY_OPTIONS]}
          value={data.nationality}
          onChange={(v) => onChange({ nationality: v })}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">{t("currentCity")} *</label>
        <SingleSelect
          options={[...CITY_OPTIONS]}
          value={data.current_city}
          onChange={(v) => onChange({ current_city: v })}
        />
      </div>
    </div>
  )
}
