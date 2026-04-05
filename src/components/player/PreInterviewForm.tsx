"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { PreInterviewFormData } from "@/types"
import { EMPTY_FORM } from "@/types"
import { submitPreInterviewForm } from "@/app/app/interview-form/actions"
import { FormStepIndicator } from "@/components/shared/FormStepIndicator"
import { Button } from "@/components/ui/button"
import { InterviewStep1 } from "./InterviewStep1"
import { InterviewStep2 } from "./InterviewStep2"
import { InterviewStep3 } from "./InterviewStep3"
import { InterviewStep4 } from "./InterviewStep4"

const STEPS = ["\u57FA\u672C\u4FE1\u606F", "\u5B66\u4E1A\u4FE1\u606F", "\u5174\u8DA3\u7231\u597D", "\u81EA\u6211\u8BC4\u4F30"]

export function PreInterviewForm() {
  const t = useTranslations("interview")
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [data, setData] = useState<PreInterviewFormData>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update(patch: Partial<PreInterviewFormData>) {
    setData((prev) => ({ ...prev, ...patch }))
  }

  function canProceed(): boolean {
    if (step === 0) {
      return !!(data.full_name.trim() && data.gender && data.age_range && data.nationality && data.current_city)
    }
    if (step === 2) {
      return data.hobby_tags.length > 0 && data.activity_type_tags.length > 0
    }
    if (step === 3) {
      return data.personality_self_tags.length > 0
    }
    return true
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const result = await submitPreInterviewForm(data)
    setSubmitting(false)

    if (result.success) {
      router.push("/app")
    } else {
      setError(result.error ?? t("submitError"))
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-2">{t("title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("subtitle")}</p>

      <FormStepIndicator steps={STEPS} currentStep={step} className="mb-8" />

      <div className="animate-fade-in">
        {step === 0 && <InterviewStep1 data={data} onChange={update} />}
        {step === 1 && <InterviewStep2 data={data} onChange={update} />}
        {step === 2 && <InterviewStep3 data={data} onChange={update} />}
        {step === 3 && <InterviewStep4 data={data} onChange={update} />}
      </div>

      {error && (
        <p className="mt-4 text-sm text-destructive">{error}</p>
      )}

      <div className="flex justify-between mt-8">
        <Button
          variant="outline"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
        >
          {t("previous")}
        </Button>

        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}>
            {t("next")}
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={!canProceed() || submitting}>
            {submitting ? t("submitting") : t("submit")}
          </Button>
        )}
      </div>
    </div>
  )
}
