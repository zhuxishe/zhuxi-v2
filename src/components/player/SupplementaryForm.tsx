"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { buildSupplementaryDraft, parseSupplementary, type SupplementaryDraft as SupplementaryFormData } from "@/lib/forms/player-enrichment"
import { submitSupplementary } from "@/app/app/profile/supplementary/actions"
import { FormStepIndicator } from "@/components/shared/FormStepIndicator"
import { Button } from "@/components/ui/button"
import { SupplementaryStep1 } from "./SupplementaryStep1"
import { SupplementaryStep2 } from "./SupplementaryStep2"
import { SupplementaryStep3 } from "./SupplementaryStep3"
import { SupplementaryStep4 } from "./SupplementaryStep4"
import type { QuestionnaireRuntime, QuestionnaireAnswers } from "@/lib/questionnaires/types"
import { validateAnswers } from "@/lib/questionnaires/validation"
import { answersToLegacy } from "@/lib/questionnaires/defaults"
import { QuestionnaireFields, questionnaireText } from "./QuestionnaireFields"
import { questionnaireAnswers, questionnaireContext, questionnaireError, questionnaireLegacy } from "./questionnaire-client"

interface Props {
  memberId: string
  existingInterests?: Record<string, unknown> | null
  existingLanguage?: Record<string, unknown> | null
  questionnaire?: QuestionnaireRuntime | null
}

export function SupplementaryForm({ memberId: _memberId, existingInterests, existingLanguage, questionnaire }: Props) {
  const router = useRouter()
  const t = useTranslations("supplementary")
  const tErr = useTranslations("errors")
  const locale = useLocale()
  const [step, setStep] = useState(0)
  const [data, setData] = useState(() => questionnaireLegacy(questionnaire, buildSupplementaryDraft(existingInterests, existingLanguage)))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runtime = useRef(questionnaire)
  const configured = Boolean(questionnaire && !questionnaire.isBaseline)
  const steps = configured ? questionnaire!.template.sections.map((section) => questionnaireText(section.title, locale)) : [t("step1"), t("step2"), t("step3"), t("step4")]

  function updateQuestionnaire(answers: QuestionnaireAnswers) {
    if (!runtime.current) return
    runtime.current = { ...runtime.current, answers }
    setData((previous) => ({ ...previous, ...answersToLegacy(runtime.current!.template, answers) }))
  }

  function canProceed() {
    return !configured || !runtime.current || validateAnswers(runtime.current.template, questionnaireAnswers(runtime.current, data), { sectionId: runtime.current.template.sections[step]?.id, existingAnswers: runtime.current.answers }).ok
  }

  function setField<K extends keyof SupplementaryFormData>(key: K, val: SupplementaryFormData[K]) {
    setData((prev) => ({ ...prev, [key]: val }))
  }

  async function handleSubmit() {
    if (submitting) return
    if (configured && runtime.current ? !validateAnswers(runtime.current.template, questionnaireAnswers(runtime.current, data), { existingAnswers: runtime.current.answers }).ok : !parseSupplementary(data)) {
      setError(tErr("invalidProfileInput"))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitSupplementary(data, questionnaireContext(runtime.current, data))
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
      <FormStepIndicator steps={steps} currentStep={step} />

      <fieldset disabled={submitting} className="space-y-6">
      {configured && runtime.current ? <QuestionnaireFields template={runtime.current.template} answers={questionnaireAnswers(runtime.current, data)} onChange={updateQuestionnaire} sectionId={runtime.current.template.sections[step]?.id} /> : <>
      {step === 0 && <SupplementaryStep1 data={data} setField={setField} />}
      {step === 1 && <SupplementaryStep2 data={data} setField={setField} />}
      {step === 2 && <SupplementaryStep3 data={data} setField={setField} />}
      {step === 3 && <SupplementaryStep4 data={data} setField={setField} />}
      </>}
      </fieldset>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        {step > 0 && (
          <Button variant="outline" disabled={submitting} onClick={() => setStep(step - 1)}>{t("previous")}</Button>
        )}
        {step < 3 ? (
          <Button onClick={() => { if (canProceed()) setStep(step + 1) }} disabled={configured && !canProceed()}>{t("next")}</Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? t("submitting") : t("submit")}
          </Button>
        )}
      </div>
    </div>
  )
}
