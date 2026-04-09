"use client"

import { useTranslations } from "next-intl"
import type { PreInterviewFormData } from "@/types"
import { MultiTagSelect } from "@/components/shared/MultiTagSelect"
import { useTagLabels } from "@/lib/i18n/use-tag-labels"
import { HOBBY_TAGS, ACTIVITY_TYPE_TAGS } from "@/lib/constants/tags"

interface Props {
  data: PreInterviewFormData
  onChange: (patch: Partial<PreInterviewFormData>) => void
}

export function InterviewStep3({ data, onChange }: Props) {
  const t = useTranslations("interview")
  const hobbyLabels = useTagLabels(HOBBY_TAGS)
  const activityLabels = useTagLabels(ACTIVITY_TYPE_TAGS)

  return (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-medium text-foreground">
          {t("hobbyTags")} *
        </label>
        <p className="text-xs text-muted-foreground mb-2">{t("hobbyTagsHint")}</p>
        <MultiTagSelect
          options={[...HOBBY_TAGS]}
          value={data.hobby_tags}
          onChange={(v) => onChange({ hobby_tags: v })}
          max={8}
          labels={hobbyLabels}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">
          {t("activityTypeTags")} *
        </label>
        <p className="text-xs text-muted-foreground mb-2">{t("activityTypeTagsHint")}</p>
        <MultiTagSelect
          options={[...ACTIVITY_TYPE_TAGS]}
          value={data.activity_type_tags}
          onChange={(v) => onChange({ activity_type_tags: v })}
          max={5}
          labels={activityLabels}
        />
      </div>
    </div>
  )
}
