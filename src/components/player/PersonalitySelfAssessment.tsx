"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"
import { buildPersonalityDraft, parsePersonality, type PersonalityDraft as PersonalitySelfData } from "@/lib/forms/player-enrichment"
import { PERSONALITY_DIMENSIONS } from "@/lib/constants/personality"
import { submitPersonality } from "@/app/app/profile/personality/actions"
import { localizePersonalityLabel, localizePersonalityDesc, localizePersonalityOption } from "@/lib/constants/personality-i18n"
import { Button } from "@/components/ui/button"
import { PersonalitySlider } from "./PersonalitySlider"
import { SingleSelect } from "@/components/shared/SingleSelect"
import { MultiTagSelect } from "@/components/shared/MultiTagSelect"
import type { QuestionnaireRuntime, QuestionnaireAnswers } from "@/lib/questionnaires/types"
import { validateAnswers } from "@/lib/questionnaires/validation"
import { answersToLegacy } from "@/lib/questionnaires/defaults"
import { QuestionnaireFields } from "./QuestionnaireFields"
import { questionnaireAnswers, questionnaireContext, questionnaireError, questionnaireLegacy } from "./questionnaire-client"

interface Props {
  existing?: Record<string, unknown> | null
  questionnaire?: QuestionnaireRuntime | null
}

export function PersonalitySelfAssessment({ existing, questionnaire }: Props) {
  const router = useRouter()
  const t = useTranslations("personality")
  const tErr = useTranslations("errors")
  const locale = useLocale()
  const [data, setData] = useState(() => questionnaireLegacy(questionnaire, buildPersonalityDraft(existing)))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runtime = useRef(questionnaire)
  const configured = Boolean(questionnaire && !questionnaire.isBaseline)

  function updateQuestionnaire(answers: QuestionnaireAnswers) {
    if (!runtime.current) return
    runtime.current = { ...runtime.current, answers }
    setData((previous) => ({ ...previous, ...answersToLegacy(runtime.current!.template, answers) }))
  }

  function setField<K extends keyof PersonalitySelfData>(key: K, val: PersonalitySelfData[K]) {
    setData((prev) => ({ ...prev, [key]: val }))
  }

  async function handleSubmit() {
    if (submitting) return
    if (configured && runtime.current ? !validateAnswers(runtime.current.template, questionnaireAnswers(runtime.current, data), { existingAnswers: runtime.current.answers }).ok : !parsePersonality(data)) {
      setError(tErr("incompletePersonality"))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitPersonality(data, questionnaireContext(runtime.current, data))
      if (result.error) setError(tErr.has(result.error) ? tErr(result.error) : questionnaireError(result.error, locale))
      else {
        router.push("/app/profile")
        router.refresh()
      }
    } catch {
      setError(tErr("networkError"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <fieldset disabled={submitting} className="space-y-6">
      {configured && runtime.current ? <QuestionnaireFields template={runtime.current.template} answers={questionnaireAnswers(runtime.current, data)} onChange={updateQuestionnaire} /> : PERSONALITY_DIMENSIONS.map((dim) => (
        <div key={dim.key} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 space-y-2">
          <div>
            <p className="text-sm font-semibold">{localizePersonalityLabel(dim.label, locale)} <span className="text-destructive">*</span></p>
            <p className="text-xs text-muted-foreground">{localizePersonalityDesc(dim.description, locale)}</p>
          </div>

          {dim.type === "slider" && (
            <PersonalitySlider
              value={data[dim.key as keyof PersonalitySelfData] as number | null}
              onChange={(v) => setField(dim.key as keyof PersonalitySelfData, v)}
              lowLabel={localizePersonalityOption(dim.sliderLabels?.[0] ?? "", locale)}
              highLabel={localizePersonalityOption(dim.sliderLabels?.[1] ?? "", locale)}
            />
          )}

          {dim.type === "single" && dim.options && (
            <SingleSelect
              options={[...dim.options]}
              value={data[dim.key as keyof PersonalitySelfData] as string}
              onChange={(v) => setField(dim.key as keyof PersonalitySelfData, v)}
              labels={locale !== "zh" ? Object.fromEntries(dim.options.map(o => [o, localizePersonalityOption(o, locale)])) : undefined}
            />
          )}

          {dim.type === "multi" && dim.options && (
            <MultiTagSelect
              options={[...dim.options]}
              value={data[dim.key as keyof PersonalitySelfData] as string[]}
              onChange={(v) => setField(dim.key as keyof PersonalitySelfData, v)}
              labels={locale !== "zh" ? Object.fromEntries(dim.options.map(o => [o, localizePersonalityOption(o, locale)])) : undefined}
            />
          )}
        </div>
      ))}
      </fieldset>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? t("submitting") : t("submit")}
        </Button>
        <Button variant="outline" disabled={submitting} onClick={() => router.back()}>{t("cancel")}</Button>
      </div>
    </div>
  )
}
