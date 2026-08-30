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
import type {
  MemberMasterActionError,
  OnboardingStep,
} from "@/lib/member-master/types"

export interface SaveStepResult {
  success: boolean
  error?: MemberMasterActionError
  onboardingStep?: number
  lastSavedAt?: string | null
}

export interface SubmitResult {
  success: boolean
  error?: MemberMasterActionError
}

/** Save exactly one UI step. The RPC owns row-level validation and atomicity. */
export async function savePreInterviewStep(
  step: OnboardingStep,
  input: unknown
): Promise<SaveStepResult> {
  await requireAuth()

  let payload: Record<string, unknown>
  try {
    payload = buildOnboardingStepPayload(step, input)
  } catch (error) {
    if (error instanceof OnboardingInputError) {
      return { success: false, error: "invalidPayload" }
    }
    throw error
  }

  try {
    const supabase = await createClient()
    const saved = await saveMyOnboardingStep(supabase, step, payload)

    revalidatePath("/app/interview-form")
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
export async function submitPreInterviewForm(): Promise<SubmitResult> {
  await requireAuth()

  try {
    const supabase = await createClient()
    await submitMyOnboarding(supabase)

    revalidatePath("/app/interview-form")
    revalidatePath("/app")
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
