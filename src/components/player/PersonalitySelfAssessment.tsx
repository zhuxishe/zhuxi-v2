"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { PersonalitySelfData } from "@/types"
import { EMPTY_PERSONALITY } from "@/types"
import { PERSONALITY_DIMENSIONS } from "@/lib/constants/personality"
import { submitPersonality } from "@/app/app/profile/personality/actions"
import { Button } from "@/components/ui/button"
import { PersonalitySlider } from "./PersonalitySlider"
import { SingleSelect } from "@/components/shared/SingleSelect"
import { MultiTagSelect } from "@/components/shared/MultiTagSelect"

interface Props {
  existing?: Record<string, unknown> | null
}

function buildInitial(existing?: Record<string, unknown> | null): PersonalitySelfData {
  if (!existing) return EMPTY_PERSONALITY
  return { ...EMPTY_PERSONALITY, ...existing } as PersonalitySelfData
}

export function PersonalitySelfAssessment({ existing }: Props) {
  const router = useRouter()
  const t = useTranslations("personality")
  const [data, setData] = useState(() => buildInitial(existing))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setField<K extends keyof PersonalitySelfData>(key: K, val: PersonalitySelfData[K]) {
    setData((prev) => ({ ...prev, [key]: val }))
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const result = await submitPersonality(data)
    setSubmitting(false)
    if (result.error) setError(result.error)
    else router.push("/app")
  }

  return (
    <div className="max-w-lg space-y-6">
      {PERSONALITY_DIMENSIONS.map((dim) => (
        <div key={dim.key} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 space-y-2">
          <div>
            <p className="text-sm font-semibold">{dim.label}</p>
            <p className="text-xs text-muted-foreground">{dim.description}</p>
          </div>

          {dim.type === "slider" && (
            <PersonalitySlider
              value={data[dim.key as keyof PersonalitySelfData] as number}
              onChange={(v) => setField(dim.key as keyof PersonalitySelfData, v)}
              lowLabel={dim.sliderLabels?.[0] ?? ""}
              highLabel={dim.sliderLabels?.[1] ?? ""}
            />
          )}

          {dim.type === "single" && dim.options && (
            <SingleSelect
              options={[...dim.options]}
              value={data[dim.key as keyof PersonalitySelfData] as string}
              onChange={(v) => setField(dim.key as keyof PersonalitySelfData, v)}
            />
          )}

          {dim.type === "multi" && dim.options && (
            <MultiTagSelect
              options={[...dim.options]}
              value={data[dim.key as keyof PersonalitySelfData] as string[]}
              onChange={(v) => setField(dim.key as keyof PersonalitySelfData, v)}
            />
          )}
        </div>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? t("submitting") : t("submit")}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>{t("cancel")}</Button>
      </div>
    </div>
  )
}
