import { describe, expect, it, vi } from "vitest"
import {
  ensureMyMemberRecord,
  fetchCanonicalMemberSnapshot,
  MemberMasterRpcError,
  resolveMemberRouteSnapshot,
  saveMyOnboardingStep,
  toMemberMasterActionError,
} from "./rpc"
import { resolvePlayerRoute } from "@/lib/auth/routing"

const MEMBER_ID = "f049f125-e2c2-42ac-b0e7-096592c62d2b"

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    member_id: MEMBER_ID,
    created: true,
    status: "pending",
    account_status: "active",
    profile_stage: "not_started",
    record_source: "app",
    onboarding_step: 0,
    last_profile_saved_at: null,
    submitted_at: null,
    ...overrides,
  }
}

describe("member master RPC helpers", () => {
  it("parses ensure response and keeps the canonical member id", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: envelope(), error: null })
    const result = await ensureMyMemberRecord({ rpc })

    expect(rpc).toHaveBeenCalledWith("ensure_my_member_record", {})
    expect(result).toMatchObject({
      memberId: MEMBER_ID,
      created: true,
      accountStatus: "active",
      profileStage: "not_started",
      onboardingStep: 0,
    })
  })

  it("returns blocked lifecycle from ensure so routing can fail closed", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: envelope({
        account_status: "suspended",
        profile_stage: "submitted",
        onboarding_step: 4,
      }),
      error: null,
    })

    const result = await ensureMyMemberRecord({ rpc })

    expect(result.accountStatus).toBe("suspended")
    expect(result.onboardingStep).toBe(4)
    expect(resolvePlayerRoute({
      status: result.status,
      accountStatus: result.accountStatus,
      profileStage: result.profileStage,
      onboardingStep: result.onboardingStep,
      hasIdentity: true,
      membershipType: "player",
    })).toEqual({ action: "redirect", to: "/app/inactive" })
  })

  it.each(["suspended", "closed"])(
    "routes a %s ensure envelope without a direct members read blocked by RLS",
    async (accountStatus) => {
      const rpc = vi.fn().mockResolvedValue({
        data: envelope({
          status: "approved",
          account_status: accountStatus,
          profile_stage: "complete",
          onboarding_step: 4,
          last_profile_saved_at: "2026-08-30T01:02:03.000Z",
        }),
        error: null,
      })
      const from = vi.fn()
      const ensured = await ensureMyMemberRecord({ rpc })

      const result = await resolveMemberRouteSnapshot({ from }, ensured)

      expect(from).not.toHaveBeenCalled()
      expect(result).toMatchObject({
        memberId: MEMBER_ID,
        status: "approved",
        accountStatus,
        profileStage: "complete",
        onboardingStep: 4,
        fullName: null,
        hasIdentity: false,
        membershipType: null,
      })
      expect(resolvePlayerRoute(result)).toEqual({
        action: "redirect",
        to: "/app/inactive",
      })
    }
  )

  it("routes legacy inactive status from ensure without a direct members read", async () => {
    const from = vi.fn()
    const ensured = await ensureMyMemberRecord({
      rpc: vi.fn().mockResolvedValue({
        data: envelope({ status: "inactive", account_status: "active" }),
        error: null,
      }),
    })

    const result = await resolveMemberRouteSnapshot({ from }, ensured)

    expect(from).not.toHaveBeenCalled()
    expect(result.status).toBe("inactive")
    expect(result.hasIdentity).toBe(false)
  })

  it("still re-reads an active member by canonical id", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: MEMBER_ID,
        member_number: "ZX-001",
        membership_type: "player",
        status: "pending",
        account_status: "active",
        profile_stage: "in_progress",
        onboarding_step: 2,
        last_profile_saved_at: null,
        submitted_at: null,
        member_identity: [{ full_name: "山田 花子" }],
      },
      error: null,
    })
    const eq = vi.fn().mockReturnValue({ maybeSingle })
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ eq }),
    })
    const ensured = await ensureMyMemberRecord({
      rpc: vi.fn().mockResolvedValue({ data: envelope(), error: null }),
    })

    const result = await resolveMemberRouteSnapshot({ from }, ensured)

    expect(eq).toHaveBeenCalledWith("id", MEMBER_ID)
    expect(result).toMatchObject({
      memberId: MEMBER_ID,
      accountStatus: "active",
      fullName: "山田 花子",
      hasIdentity: true,
      membershipType: "player",
    })
  })

  it("calls step save with named RPC arguments", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: envelope({
        saved_step: 2,
        profile_stage: "in_progress",
        onboarding_step: 2,
        last_profile_saved_at: "2026-08-30T01:02:03.000Z",
      }),
      error: null,
    })
    const payload = { school_name: "早稲田大学" }

    const result = await saveMyOnboardingStep({ rpc }, 2, payload)

    expect(rpc).toHaveBeenCalledWith("save_my_onboarding_step", {
      p_step: 2,
      p_payload: payload,
    })
    expect(result.savedStep).toBe(2)
    expect(result.onboardingStep).toBe(2)
  })

  it("maps stable database machine codes without exposing raw messages", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "22023", message: "MEMBER_MASTER_STEP_OUT_OF_ORDER" },
    })

    let caught: unknown
    try {
      await saveMyOnboardingStep({ rpc }, 2, {})
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(MemberMasterRpcError)
    expect(toMemberMasterActionError(caught, "saveFailed")).toBe("stepOutOfOrder")
    expect((caught as Error).message).not.toContain("STEP_OUT_OF_ORDER")
  })

  it("maps blocked save/submit errors to a safe UI code", () => {
    const error = new MemberMasterRpcError("save", {
      code: "P0001",
      message: "MEMBER_MASTER_ACCOUNT_BLOCKED",
    })

    expect(toMemberMasterActionError(error, "saveFailed")).toBe("accountBlocked")
  })

  it("re-reads lifecycle state by canonical members.id", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: MEMBER_ID,
        member_number: "ZX-001",
        membership_type: "player",
        status: "pending",
        account_status: "active",
        profile_stage: "in_progress",
        onboarding_step: 2,
        last_profile_saved_at: "2026-08-30T01:02:03.000Z",
        submitted_at: null,
        member_identity: [{ full_name: "山田 花子" }],
      },
      error: null,
    })
    const eq = vi.fn().mockReturnValue({ maybeSingle })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })

    const result = await fetchCanonicalMemberSnapshot({ from }, MEMBER_ID)

    expect(from).toHaveBeenCalledWith("members")
    expect(eq).toHaveBeenCalledWith("id", MEMBER_ID)
    expect(result).toMatchObject({
      memberId: MEMBER_ID,
      accountStatus: "active",
      profileStage: "in_progress",
      onboardingStep: 2,
      fullName: "山田 花子",
      hasIdentity: true,
      membershipType: "player",
    })
  })
})
