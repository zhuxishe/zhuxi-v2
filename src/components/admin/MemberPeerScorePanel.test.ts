import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), rethrow: vi.fn() }))
vi.mock("@/lib/queries/member-peer-score", () => ({ fetchMemberPeerScore: mocks.fetch }))
vi.mock("next/navigation", () => ({ unstable_rethrow: mocks.rethrow }))
import { MemberPeerScorePanel } from "./MemberPeerScorePanel"

describe("member peer score panel failure isolation", () => {
  beforeEach(() => { vi.clearAllMocks() })
  it("shows an explicit unavailable state without interrupting the member page", async () => {
    mocks.fetch.mockResolvedValueOnce({ status: "unavailable" })
    expect((await MemberPeerScorePanel({ memberId: "member-id" })).props.result).toEqual({ status: "unavailable" })
  })
  it("renders database failures as errors instead of empty scores", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.fetch.mockRejectedValueOnce(new Error("connection failed"))
    expect((await MemberPeerScorePanel({ memberId: "member-id" })).props.result).toEqual({ status: "error" })
    expect(mocks.rethrow).toHaveBeenCalled()
    log.mockRestore()
  })
  it("does not swallow framework redirects from the administrator check", async () => {
    const redirect = new Error("NEXT_REDIRECT")
    mocks.fetch.mockRejectedValueOnce(redirect)
    mocks.rethrow.mockImplementationOnce((error) => { throw error })
    await expect(MemberPeerScorePanel({ memberId: "member-id" })).rejects.toBe(redirect)
  })
})
