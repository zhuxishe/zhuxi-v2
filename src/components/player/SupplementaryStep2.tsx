"use client"

import { useTranslations } from "next-intl"
import type { SupplementaryFormData } from "@/types"
import { MultiTagSelect } from "@/components/shared/MultiTagSelect"
import { SingleSelect } from "@/components/shared/SingleSelect"
import {
  COMMUNICATION_LANGUAGE_OPTIONS,
  JAPANESE_LEVEL_OPTIONS,
} from "@/lib/constants/supplementary"
import { useTagLabels } from "@/lib/i18n/use-tag-labels"

interface Props {
  data: SupplementaryFormData
  setField: <K extends keyof SupplementaryFormData>(key: K, val: SupplementaryFormData[K]) => void
}

export function SupplementaryStep2({ data, setField }: Props) {
  const t = useTranslations("supplementary")
  const commLangLabels = useTagLabels(COMMUNICATION_LANGUAGE_OPTIONS)
  const jpLevelLabels = useTagLabels(JAPANESE_LEVEL_OPTIONS)

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium mb-1 block">{t("languagePref")}</label>
        <p className="text-xs text-muted-foreground mb-2">{t("languagePrefHint")}</p>
        <MultiTagSelect
          options={[...COMMUNICATION_LANGUAGE_OPTIONS]}
          value={data.communication_language_pref}
          onChange={(v) => setField("communication_language_pref", v)}
          labels={commLangLabels}
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">{t("japaneseLevel")}</label>
        <SingleSelect
          options={[...JAPANESE_LEVEL_OPTIONS]}
          value={data.japanese_level}
          onChange={(v) => setField("japanese_level", v)}
          labels={jpLevelLabels}
        />
      </div>
    </div>
  )
}
