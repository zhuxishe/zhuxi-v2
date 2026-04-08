"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { SupplementaryFormData } from "@/types"
import { EMPTY_SUPPLEMENTARY } from "@/types"
import { submitSupplementary } from "@/app/app/profile/supplementary/actions"
import { FormStepIndicator } from "@/components/shared/FormStepIndicator"
import { Button } from "@/components/ui/button"
import { SupplementaryStep1 } from "./SupplementaryStep1"
import { SupplementaryStep2 } from "./SupplementaryStep2"
import { SupplementaryStep3 } from "./SupplementaryStep3"
import { SupplementaryStep4 } from "./SupplementaryStep4"

interface Props {
  memberId: string
  existingInterests?: Record<string, unknown> | null
  existingLanguage?: Record<string, unknown> | null
}

function buildInitial(interests?: Record<string, unknown> | null, language?: Record<string, unknown> | null): SupplementaryFormData {
  if (!interests && !language) return EMPTY_SUPPLEMENTARY
  return {
    ...EMPTY_SUPPLEMENTARY,
    ...(language ?? {}),
    ...(interests ?? {}),
  } as SupplementaryFormData
}

export function SupplementaryForm({ memberId: _memberId, existingInterests, existingLanguage }: Props) {
  const router = useRouter()
  const t = useTranslations("supplementary")
  const [step, setStep] = useState(0)
  const [data, setData] = useState(() => buildInitial(existingInterests, existingLanguage))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const steps = [t("step1"), t("step2"), t("step3"), t("step4")]

  function setField<K extends keyof SupplementaryFormData>(key: K, val: SupplementaryFormData[K]) {
    setData((prev) => ({ ...prev, [key]: val }))
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const result = await submitSupplementary(data)
    setSubmitting(false)
    if (result.error) setError(result.error)
    else router.push("/app")
  }

  return (
    <div className="max-w-lg space-y-6">
      <FormStepIndicator steps={steps} currentStep={step} />

      {step === 0 && <SupplementaryStep1 data={data} setField={setField} />}
      {step === 1 && <SupplementaryStep2 data={data} setField={setField} />}
      {step === 2 && <SupplementaryStep3 data={data} setField={setField} />}
      {step === 3 && <SupplementaryStep4 data={data} setField={setField} />}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(step - 1)}>{t("previous")}</Button>
        )}
        {step < 3 ? (
          <Button onClick={() => setStep(step + 1)}>{t("next")}</Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? t("submitting") : t("submit")}
          </Button>
        )}
      </div>
    </div>
  )
}
