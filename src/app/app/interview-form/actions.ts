"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/auth/player"
import {
  buildOnboardingStepPayload,
  OnboardingInputError,
} from "@/lib/member-master/onboarding"
import {
  getMemberMasterDiagnostic,
  saveMyOnboardingStep,
  submitMyOnboarding,
  toMemberMasterActionError,
} from "@/lib/member-master/rpc"
import { resolveQuestionnaireSubmission } from "@/components/player/questionnaire-submit"
import type { QuestionnaireSubmitContext } from "@/components/player/questionnaire-client"
import type { QuestionnaireRuntime } from "@/lib/questionnaires/types"
import type {
  OnboardingStep,
} from "@/lib/member-master/types"

export interface SaveStepResult {
  success: boolean
  error?: string
  onboardingStep?: number
  lastSavedAt?: string | null
  questionnaire?: QuestionnaireRuntime
}

export interface SubmitResult {
  success: boolean
  error?: string
}

function revalidateMemberViews(memberId: string) {
  revalidatePath("/app/interview-form")
  revalidatePath("/app")
  revalidatePath("/app/profile")
  revalidatePath("/admin")
  revalidatePath("/admin/members")
  revalidatePath(`/admin/members/${memberId}`)
}

/** Save exactly one UI step. The RPC owns row-level validation and atomicity. */
export async function savePreInterviewStep(
  step: OnboardingStep,
  input: unknown,
  context?: QuestionnaireSubmitContext
): Promise<SaveStepResult> {
  await requireAuth()
  try { context = await resolveQuestionnaireSubmission("interview", context, input && typeof input === "object" ? input : {}) }
  catch { return { success: false, error: "saveFailed" } }

  if (context) {
    try {
      const { savePlayerQuestionnaire } = await import("@/lib/questionnaires/server")
      const saved = await savePlayerQuestionnaire("interview", context.versionId, context.answers, { step, expectedRevision: context.revision })
      if (!saved.success) return { success: false, error: saved.error }
      revalidatePath("/app/interview-form")
      revalidatePath("/app")
      return { success: true, onboardingStep: step, lastSavedAt: new Date().toISOString(), questionnaire: saved.runtime }
    } catch { return { success: false, error: "saveFailed" } }
  }

  let payload: Record<string, unknown>
  try {
    payload = buildOnboardingStepPayload(step, input)
  } catch (error) {
    if (error instanceof OnboardingInputError) {
      return { success: false, error: "invalidPayload" }
    }
    throw error
  }

  if (step === 1 && typeof payload.nickname === "string") {
    const nicknameLength = [...payload.nickname.normalize("NFKC").trim()].length
    if (nicknameLength === 1) return { success: false, error: "nicknameTooShort" }
    if (nicknameLength > 20) return { success: false, error: "nicknameTooLong" }
  }

  try {
    const supabase = await createClient()
    const saved = await saveMyOnboardingStep(supabase, step, payload)

    revalidateMemberViews(saved.memberId)
    return {
      success: true,
      onboardingStep: saved.onboardingStep,
      lastSavedAt: saved.lastProfileSavedAt,
    }
  } catch (error) {
    console.error(
      "[savePreInterviewStep] member master failed:",
      getMemberMasterDiagnostic(error)
    )
    return {
      success: false,
      error: toMemberMasterActionError(error, "saveFailed"),
    }
  }
}

/** Finalize the already-saved four-step draft. No direct table writes occur. */
export async function submitPreInterviewForm(context?: QuestionnaireSubmitContext): Promise<SubmitResult> {
  await requireAuth()
  try { context = await resolveQuestionnaireSubmission("interview", context) }
  catch { return { success: false, error: "submitFailed" } }

  if (context) {
    try {
      const { savePlayerQuestionnaire } = await import("@/lib/questionnaires/server")
      const saved = await savePlayerQuestionnaire("interview", context.versionId, context.answers, { complete: true, expectedRevision: context.revision })
      if (!saved.success) return { success: false, error: saved.error }
      revalidatePath("/app/interview-form")
      revalidatePath("/app")
      revalidatePath("/app/profile")
      revalidatePath("/admin/members")
      return { success: true }
    } catch { return { success: false, error: "submitFailed" } }
  }

  try {
    const supabase = await createClient()
    const submitted = await submitMyOnboarding(supabase)

    revalidateMemberViews(submitted.memberId)
    return { success: true }
  } catch (error) {
    console.error(
      "[submitPreInterviewForm] member master failed:",
      getMemberMasterDiagnostic(error)
    )
    return {
      success: false,
      error: toMemberMasterActionError(error, "submitFailed"),
    }
  }
}
