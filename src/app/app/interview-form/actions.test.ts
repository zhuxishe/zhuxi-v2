import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireAuth: vi.fn(),
  revalidatePath: vi.fn(),
  saveMyOnboardingStep: vi.fn(),
  submitMyOnboarding: vi.fn(),
  toMemberMasterActionError: vi.fn(),
  getMemberMasterDiagnostic: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/auth/player", () => ({ requireAuth: mocks.requireAuth }))
vi.mock("@/lib/member-master/rpc", () => ({
  saveMyOnboardingStep: mocks.saveMyOnboardingStep,
  submitMyOnboarding: mocks.submitMyOnboarding,
  toMemberMasterActionError: mocks.toMemberMasterActionError,
  getMemberMasterDiagnostic: mocks.getMemberMasterDiagnostic,
}))

import {
  savePreInterviewStep,
  submitPreInterviewForm,
} from "./actions"

describe("interview form server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: "auth-user" })
    mocks.createClient.mockResolvedValue({ marker: "request-scoped-client" })
    mocks.toMemberMasterActionError.mockReturnValue("saveFailed")
    mocks.getMemberMasterDiagnostic.mockReturnValue("TEST")
  })

  it("shapes and atomically saves one step without direct table writes", async () => {
    mocks.saveMyOnboardingStep.mockResolvedValue({
      onboardingStep: 1,
      lastProfileSavedAt: "2026-08-30T01:02:03.000Z",
    })

    const result = await savePreInterviewStep(1, {
      full_name: "  山田 花子 ",
      nickname: "",
      gender: "female",
      age_range: "20-24",
      nationality: "jp",
      current_city: "tokyo",
      user_id: "must-not-pass-through",
      status: "approved",
    })

    expect(mocks.saveMyOnboardingStep).toHaveBeenCalledWith(
      { marker: "request-scoped-client" },
      1,
      {
        full_name: "山田 花子",
        nickname: null,
        gender: "female",
        age_range: "20-24",
        nationality: "jp",
        current_city: "tokyo",
      }
    )
    expect(result).toEqual({
      success: true,
      onboardingStep: 1,
      lastSavedAt: "2026-08-30T01:02:03.000Z",
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/interview-form")
  })

  it("rejects malformed input before opening a database client", async () => {
    const result = await savePreInterviewStep(1, {
      full_name: "",
      gender: "female",
      age_range: "20-24",
      nationality: "jp",
      current_city: "tokyo",
    })

    expect(result).toEqual({ success: false, error: "invalidPayload" })
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.saveMyOnboardingStep).not.toHaveBeenCalled()
  })

  it("leaves the draft intact when the step RPC fails", async () => {
    mocks.saveMyOnboardingStep.mockRejectedValue(new Error("database unavailable"))
    mocks.toMemberMasterActionError.mockReturnValue("saveFailed")

    const result = await savePreInterviewStep(3, {
      hobby_tags: ["music"],
      activity_type_tags: ["meal"],
    })

    expect(result).toEqual({ success: false, error: "saveFailed" })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("final submission calls only the submit RPC and revalidates player routes", async () => {
    mocks.submitMyOnboarding.mockResolvedValue({ status: "pending" })

    const result = await submitPreInterviewForm()

    expect(result).toEqual({ success: true })
    expect(mocks.submitMyOnboarding).toHaveBeenCalledOnce()
    expect(mocks.saveMyOnboardingStep).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/interview-form")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app")
  })
})
