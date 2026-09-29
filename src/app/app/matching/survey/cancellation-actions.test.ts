import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ player: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }))
vi.mock("@/lib/auth/player", () => ({ requirePlayer: mocks.player }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
import { cancelRegistration } from "./cancellation-actions"

const roundId = "429eea31-9986-42a8-b2b9-67f792e07173"
const input = { roundId, expectedUpdatedAt: "2026-09-29T01:00:00.123456Z" }
describe("registration cancellation action", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.player.mockResolvedValue({ memberId: "canonical-member" })
    mocks.rpc.mockResolvedValue({ error: null })
  })
  it("uses only authenticated identity and sends the original record version", async () => {
    expect(await cancelRegistration(input)).toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledWith("manage_my_registration", {
      p_round_id: roundId, p_operation: "cancel", p_expected_updated_at: input.expectedUpdatedAt,
    })
    expect(mocks.revalidate).toHaveBeenCalledWith("/app", "layout")
    expect(mocks.revalidate).toHaveBeenCalledWith(`/app/matches/rounds/${roundId}`)
    expect(mocks.revalidate).toHaveBeenCalledWith(`/admin/matching/rounds/${roundId}`)
  })
  it("checks authentication before attempting cancellation", async () => {
    mocks.player.mockRejectedValue(new Error("redirect"))
    await expect(cancelRegistration(input)).rejects.toThrow("redirect")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each([
    { ...input, roundId: "not-a-round" },
    { ...input, expectedUpdatedAt: "invalid" },
    { roundId },
  ])("rejects malformed identity/version inputs", async (value) => {
    expect(await cancelRegistration(value as typeof input)).toEqual({ error: "invalidSurveyInput" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("accepts a null version only when that was the actual legacy value", async () => {
    expect(await cancelRegistration({ roundId, expectedUpdatedAt: null })).toEqual({ success: true })
    expect(mocks.rpc.mock.calls[0][1].p_expected_updated_at).toBeNull()
  })
  it.each([
    ["REGISTRATION_STATE_CHANGED", "registrationChanged"],
    ["REGISTRATION_CANCEL_UNAVAILABLE", "registrationCancelUnavailable"],
    ["REGISTRATION_NOT_FOUND", "registrationNotFound"],
    ["unrelated failure", "saveFailed"],
  ])("maps database rejection %s without refreshing successful state", async (message, error) => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.rpc.mockResolvedValue({ error: { message } })
    expect(await cancelRegistration(input)).toEqual({ error })
    expect(mocks.revalidate).not.toHaveBeenCalled()
    logger.mockRestore()
  })
})
