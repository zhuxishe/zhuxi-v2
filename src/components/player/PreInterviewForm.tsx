"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import type { PreInterviewFormData } from "@/types"
import { EMPTY_FORM } from "@/types"
import {
  savePreInterviewStep,
  submitPreInterviewForm,
} from "@/app/app/interview-form/actions"
import type {
  MemberMasterActionError,
  OnboardingStep,
} from "@/lib/member-master/types"
import { FormStepIndicator } from "@/components/shared/FormStepIndicator"
import { Button } from "@/components/ui/button"
import { HomeLink } from "@/components/auth/HomeLink"
import { InterviewStep1 } from "./InterviewStep1"
import { InterviewStep2 } from "./InterviewStep2"
import { InterviewStep3 } from "./InterviewStep3"
import { InterviewStep4 } from "./InterviewStep4"

interface Props {
  defaultValues?: PreInterviewFormData
  initialStep?: 0 | 1 | 2 | 3
  initialLastSavedAt?: string | null
}

const ERROR_TRANSLATIONS: Record<MemberMasterActionError, string> = {
  accountBlocked: "accountBlockedError",
  invalidStep: "invalidStepError",
  stepOutOfOrder: "stepOutOfOrderError",
  invalidPayload: "invalidPayloadError",
  requiredFieldsMissing: "requiredFieldsError",
  nicknameConflict: "nicknameConflictError",
  onboardingLocked: "onboardingLockedError",
  saveFailed: "saveError",
  submitFailed: "submitError",
}

export function PreInterviewForm({
  defaultValues,
  initialStep = 0,
  initialLastSavedAt = null,
}: Props) {
  const t = useTranslations("interview")
  const locale = useLocale()
  const STEPS = [t("stepBasic"), t("stepAcademic"), t("stepInterests"), t("stepPersonality")]
  const router = useRouter()
  const [step, setStep] = useState(initialStep)
  const [data, setData] = useState<PreInterviewFormData>(defaultValues ?? EMPTY_FORM)
  const [busy, setBusy] = useState<"saving" | "submitting" | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initialLastSavedAt)
  const [error, setError] = useState<string | null>(null)

  const formattedLastSavedAt = useMemo(() => {
    if (!lastSavedAt) return null
    const date = new Date(lastSavedAt)
    if (Number.isNaN(date.getTime())) return null
    return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "zh-CN", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Tokyo",
    }).format(date)
  }, [lastSavedAt, locale])

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

  function translateError(code: MemberMasterActionError | undefined) {
    return code ? t(ERROR_TRANSLATIONS[code]) : t("submitError")
  }

  async function saveCurrentStep() {
    setBusy("saving")
    setError(null)
    const result = await savePreInterviewStep((step + 1) as OnboardingStep, data)

    if (result.success) {
      setLastSavedAt(result.lastSavedAt ?? new Date().toISOString())
      setBusy(null)
      return true
    }

    setError(translateError(result.error))
    setBusy(null)
    return false
  }

  async function handleNext() {
    if (!(await saveCurrentStep())) return
    setStep((current) => Math.min(current + 1, 3) as 0 | 1 | 2 | 3)
  }

  async function handleSubmit() {
    if (!(await saveCurrentStep())) return

    setBusy("submitting")
    const result = await submitPreInterviewForm()
    setBusy(null)

    if (!result.success) {
      setError(translateError(result.error))
      return
    }

    router.replace("/app")
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <HomeLink className="mb-6" />
      <h1 className="text-2xl font-bold text-foreground mb-2">{t("title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("subtitle")}</p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {t("progress", { current: step + 1, total: STEPS.length })}
        </span>
        <span aria-live="polite">
          {busy === "saving"
            ? t("savingStep", { step: step + 1 })
            : busy === "submitting"
              ? t("submitting")
              : formattedLastSavedAt
                ? t("lastSavedAt", { time: formattedLastSavedAt })
                : t("notSavedYet")}
        </span>
      </div>

      <FormStepIndicator steps={STEPS} currentStep={step} className="mb-8" />

      <div className="animate-fade-in">
        {step === 0 && <InterviewStep1 data={data} onChange={update} />}
        {step === 1 && <InterviewStep2 data={data} onChange={update} />}
        {step === 2 && <InterviewStep3 data={data} onChange={update} />}
        {step === 3 && <InterviewStep4 data={data} onChange={update} />}
      </div>

      {error && (
        <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>
      )}

      <div className="flex justify-between mt-8">
        <Button
          variant="outline"
          onClick={() => {
            setError(null)
            setStep((current) => Math.max(current - 1, 0) as 0 | 1 | 2 | 3)
          }}
          disabled={step === 0 || busy !== null}
        >
          {t("previous")}
        </Button>

        {step < STEPS.length - 1 ? (
          <Button onClick={handleNext} disabled={!canProceed() || busy !== null}>
            {busy === "saving" ? t("saving") : t("next")}
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={!canProceed() || busy !== null}>
            {busy === "saving"
              ? t("saving")
              : busy === "submitting"
                ? t("submitting")
                : t("submit")}
          </Button>
        )}
      </div>
    </div>
  )
}
