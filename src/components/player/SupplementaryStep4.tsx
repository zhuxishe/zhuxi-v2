"use client"

import { useTranslations } from "next-intl"
import type { SupplementaryFormData } from "@/types"
import { SingleSelect } from "@/components/shared/SingleSelect"
import { SOCIAL_GOAL_OPTIONS } from "@/lib/constants/supplementary"
import { cn } from "@/lib/utils"
import { useTagLabels } from "@/lib/i18n/use-tag-labels"

interface Props {
  data: SupplementaryFormData
  setField: <K extends keyof SupplementaryFormData>(key: K, val: SupplementaryFormData[K]) => void
}

function ToggleButton({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        "rounded-full px-4 py-2 text-sm font-medium transition-colors",
        value
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      )}
    >
      {label}
    </button>
  )
}

export function SupplementaryStep4({ data, setField }: Props) {
  const t = useTranslations("supplementary")
  const socialGoalLabels = useTagLabels(SOCIAL_GOAL_OPTIONS)

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium mb-2 block">{t("goalPrimary")}</label>
        <SingleSelect
          options={[...SOCIAL_GOAL_OPTIONS]}
          value={data.social_goal_primary}
          onChange={(v) => setField("social_goal_primary", v)}
          labels={socialGoalLabels}
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">{t("goalSecondary")}</label>
        <SingleSelect
          options={[...SOCIAL_GOAL_OPTIONS]}
          value={data.social_goal_secondary}
          onChange={(v) => setField("social_goal_secondary", v)}
          labels={socialGoalLabels}
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">{t("acceptBeginners")}</label>
        <div className="flex gap-2">
          <ToggleButton label={t("yes")} value={data.accept_beginners} onChange={(v) => setField("accept_beginners", v)} />
          <ToggleButton label={t("no")} value={!data.accept_beginners} onChange={(v) => setField("accept_beginners", !v)} />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">{t("acceptCrossSchool")}</label>
        <div className="flex gap-2">
          <ToggleButton label={t("yes")} value={data.accept_cross_school} onChange={(v) => setField("accept_cross_school", v)} />
          <ToggleButton label={t("no")} value={!data.accept_cross_school} onChange={(v) => setField("accept_cross_school", !v)} />
        </div>
      </div>
    </div>
  )
}
