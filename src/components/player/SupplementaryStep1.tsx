"use client"

import { useTranslations } from "next-intl"
import type { SupplementaryFormData } from "@/types"
import { SingleSelect } from "@/components/shared/SingleSelect"
import {
  ACTIVITY_AREA_OPTIONS,
  GRADUATION_YEAR_OPTIONS,
} from "@/lib/constants/supplementary"
import { StationSearchSelect } from "@/components/ui/StationSearchSelect"
import { useTagLabels } from "@/lib/i18n/use-tag-labels"

interface Props {
  data: SupplementaryFormData
  setField: <K extends keyof SupplementaryFormData>(key: K, val: SupplementaryFormData[K]) => void
}

export function SupplementaryStep1({ data, setField }: Props) {
  const t = useTranslations("supplementary")
  const activityAreaLabels = useTagLabels(ACTIVITY_AREA_OPTIONS)

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium mb-2 block">{t("activityArea")}</label>
        <SingleSelect
          options={[...ACTIVITY_AREA_OPTIONS]}
          value={data.activity_area}
          onChange={(v) => setField("activity_area", v)}
          labels={activityAreaLabels}
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">{t("nearestStation")}</label>
        <StationSearchSelect
          value={data.nearest_station}
          onChange={(v) => setField("nearest_station", v)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary transition-colors"
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">{t("graduationYear")}</label>
        <SingleSelect
          options={GRADUATION_YEAR_OPTIONS.map(String)}
          value={data.graduation_year?.toString() ?? ""}
          onChange={(v) => setField("graduation_year", parseInt(v))}
        />
      </div>
    </div>
  )
}
