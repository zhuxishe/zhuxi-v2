import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  member: vi.fn(), player: vi.fn(), client: vi.fn(), from: vi.fn(),
  select: vi.fn(), eq: vi.fn(), single: vi.fn(), redirect: vi.fn(),
}))

vi.mock("@/lib/auth/player", () => ({ requireMemberRecord: mocks.member, requirePlayer: mocks.player }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }))
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("redirect:")) throw error
  },
}))

import { fetchMyProfileDetails, loadMyProfileDetails } from "./details-query"

const member = {
  memberId: "canonical-current-member", accountStatus: "active", status: "pending",
  hasIdentity: true, onboardingStep: 4, profileStage: "submitted", membershipType: "player",
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.member.mockResolvedValue(member)
  mocks.player.mockResolvedValue({ ...member, status: "approved" })
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`) })
  mocks.client.mockResolvedValue({ from: mocks.from })
  mocks.from.mockReturnValue({ select: mocks.select })
  mocks.select.mockReturnValue({ eq: mocks.eq })
  mocks.eq.mockReturnValue({ single: mocks.single })
  mocks.single.mockResolvedValue({
    data: {
      id: member.memberId,
      member_identity: [{ full_name: "Test", age_range: "24-26", school_name: null }],
      member_language: { communication_language_pref: ["中文"] },
      member_interests: { accept_beginners: false },
      member_personality: null,
      personality_quiz_results: [],
    },
    error: null,
  })
})

describe("current member profile detail reads", () => {
  it.each(["pending", "rejected"])("allows submitted %s members to review only their own canonical record", async (status) => {
    mocks.member.mockResolvedValue({ ...member, status })
    const details = await fetchMyProfileDetails()
    expect(mocks.eq).toHaveBeenCalledWith("id", member.memberId)
    expect(mocks.player).not.toHaveBeenCalled()
    expect(details.identity).toMatchObject({ full_name: "Test", school_name: null })
    expect(details.interests?.accept_beginners).toBe(false)
    expect(details.personality).toBeNull()
    expect(details.quiz).toBeNull()
    expect(mocks.select.mock.calls[0][0]).not.toContain("answers")
  })

  it("continues to enforce approved player membership for approved accounts", async () => {
    mocks.member.mockResolvedValue({ ...member, status: "approved" })
    await fetchMyProfileDetails()
    expect(mocks.player).toHaveBeenCalledOnce()
  })

  it.each([
    { accountStatus: "closed" },
    { status: "inactive" },
    { onboardingStep: 3 },
    { profileStage: "in_progress" },
    { hasIdentity: false },
  ])("blocks detail reads before submission or after account deactivation: %o", async (override) => {
    mocks.member.mockResolvedValue({ ...member, ...override })
    await expect(fetchMyProfileDetails()).rejects.toThrow("redirect:")
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it("returns a distinguishable load failure instead of an empty profile", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.single.mockResolvedValue({ data: null, error: { code: "42501", message: "Denied" } })
    expect(await loadMyProfileDetails()).toBeNull()
    expect(log).toHaveBeenCalledWith("[profile details unavailable]", { code: "42501" })
    log.mockRestore()
  })

  it("does not swallow redirects in the recoverable read-error wrapper", async () => {
    mocks.member.mockResolvedValue({ ...member, accountStatus: "closed" })
    await expect(loadMyProfileDetails()).rejects.toThrow("redirect:/app/inactive")
  })
})
