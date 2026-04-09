"use client"

import { useTranslations } from "next-intl"
import type { PreInterviewFormData } from "@/types"
import { MultiTagSelect } from "@/components/shared/MultiTagSelect"
import { useTagLabels } from "@/lib/i18n/use-tag-labels"
import { PERSONALITY_SELF_TAGS, TABOO_TAGS } from "@/lib/constants/tags"

interface Props {
  data: PreInterviewFormData
  onChange: (patch: Partial<PreInterviewFormData>) => void
}

export function InterviewStep4({ data, onChange }: Props) {
  const t = useTranslations("interview")
  const personalityLabels = useTagLabels(PERSONALITY_SELF_TAGS)
  const tabooLabels = useTagLabels(TABOO_TAGS)

  return (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-medium text-foreground">
          {t("personalityTags")} *
        </label>
        <p className="text-xs text-muted-foreground mb-2">{t("personalityTagsHint")}</p>
        <MultiTagSelect
          options={[...PERSONALITY_SELF_TAGS]}
          value={data.personality_self_tags}
          onChange={(v) => onChange({ personality_self_tags: v })}
          max={5}
          labels={personalityLabels}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">
          {t("tabooTags")}
        </label>
        <p className="text-xs text-muted-foreground mb-2">{t("tabooTagsHint")}</p>
        <MultiTagSelect
          options={[...TABOO_TAGS]}
          value={data.taboo_tags}
          onChange={(v) => onChange({ taboo_tags: v })}
          labels={tabooLabels}
        />
      </div>
    </div>
  )
}
