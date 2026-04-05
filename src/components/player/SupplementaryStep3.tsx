"use client"

import { useTranslations } from "next-intl"
import type { SupplementaryFormData } from "@/types"
import { MultiTagSelect } from "@/components/shared/MultiTagSelect"
import { SingleSelect } from "@/components/shared/SingleSelect"
import {
  SCENARIO_MODE_OPTIONS,
  GROUP_SIZE_OPTIONS,
  SCRIPT_PREFERENCE_OPTIONS,
  NON_SCRIPT_PREFERENCE_OPTIONS,
  ACTIVITY_FREQUENCY_OPTIONS,
  TIME_SLOT_OPTIONS,
  BUDGET_RANGE_OPTIONS,
  TRAVEL_RADIUS_OPTIONS,
} from "@/lib/constants/supplementary"

interface Props {
  data: SupplementaryFormData
  setField: <K extends keyof SupplementaryFormData>(key: K, val: SupplementaryFormData[K]) => void
}

export function SupplementaryStep3({ data, setField }: Props) {
  const t = useTranslations("supplementary")

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium mb-1 block">{t("scenarioMode")}</label>
        <p className="text-xs text-muted-foreground mb-2">{t("scenarioModeHint")}</p>
        <MultiTagSelect
          options={[...SCENARIO_MODE_OPTIONS]}
          value={data.scenario_mode_pref}
          onChange={(v) => setField("scenario_mode_pref", v)}
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">{t("groupSize")}</label>
        <SingleSelect
          options={[...GROUP_SIZE_OPTIONS]}
          value={data.ideal_group_size}
          onChange={(v) => setField("ideal_group_size", v)}
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">{t("scriptPref")}</label>
        <MultiTagSelect
          options={[...SCRIPT_PREFERENCE_OPTIONS]}
          value={data.script_preference}
          onChange={(v) => setField("script_preference", v)}
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">{t("nonScriptPref")}</label>
        <MultiTagSelect
          options={[...NON_SCRIPT_PREFERENCE_OPTIONS]}
          value={data.non_script_preference}
          onChange={(v) => setField("non_script_preference", v)}
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">{t("frequency")}</label>
        <SingleSelect
          options={[...ACTIVITY_FREQUENCY_OPTIONS]}
          value={data.activity_frequency}
          onChange={(v) => setField("activity_frequency", v)}
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-1 block">{t("timeSlots")}</label>
        <p className="text-xs text-muted-foreground mb-2">{t("timeSlotsHint")}</p>
        <MultiTagSelect
          options={[...TIME_SLOT_OPTIONS]}
          value={data.preferred_time_slots}
          onChange={(v) => setField("preferred_time_slots", v)}
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">{t("budget")}</label>
        <SingleSelect
          options={[...BUDGET_RANGE_OPTIONS]}
          value={data.budget_range}
          onChange={(v) => setField("budget_range", v)}
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">{t("travelRadius")}</label>
        <SingleSelect
          options={[...TRAVEL_RADIUS_OPTIONS]}
          value={data.travel_radius}
          onChange={(v) => setField("travel_radius", v)}
        />
      </div>
    </div>
  )
}
