import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
vi.mock("@/lib/activity-reviews/queries", () => ({
  activityReviewRpc: mocks.rpc,
  activityReviewErrorCode: (error: unknown) => error instanceof Error ? error.message : "PEER_SAVE_FAILED",
}))
import { confirmActivityReviewRosterAction, restoreReviewRegistrationAction } from "./actions"

const roundId = "11111111-1111-4111-8111-111111111111"
const memberId = "22222222-2222-4222-8222-222222222222"
const input = { roundId, memberIds: [] as string[], expectedVersion: 2, reason: "核实实际参与名单" }

describe("server-authorized unified roster corrections", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ role: "admin" })
    mocks.rpc.mockResolvedValue({ settings: { review_system: "unified" } })
  })
  it("accepts zero or one participant only after checking the stored activity version", async () => {
    for (const memberIds of [[], [memberId]]) {
      mocks.rpc.mockClear()
      expect(await confirmActivityReviewRosterAction({ ...input, memberIds })).toEqual({ success: true })
      expect(mocks.rpc).toHaveBeenNthCalledWith(1, "admin_get_round_peer_reviews", { p_round_id: roundId })
      expect(mocks.rpc).toHaveBeenNthCalledWith(2, "admin_confirm_round_peer_review_roster", {
        p_round_id: roundId, p_member_ids: memberIds, p_expected_version: 2, p_reason: input.reason,
      })
    }
  })
  it("does not let a client flag or a missing version weaken legacy roster rules", async () => {
    for (const settings of [{ review_system: "legacy" }, {}, { review_system: "unknown" }]) {
      mocks.rpc.mockClear()
      mocks.rpc.mockResolvedValueOnce({ settings })
      expect(await confirmActivityReviewRosterAction({ ...input, reviewSystem: "unified" } as typeof input)).toEqual({ error: "PEER_INVALID_INPUT" })
      expect(mocks.rpc).toHaveBeenCalledTimes(1)
      expect(mocks.revalidate).not.toHaveBeenCalled()
    }
  })
  it("fails closed when the authoritative read fails and rejects malformed payloads before querying", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("PEER_ADMIN_REQUIRED"))
    expect(await confirmActivityReviewRosterAction(input)).toEqual({ error: "PEER_ADMIN_REQUIRED" })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    mocks.rpc.mockClear()
    expect(await confirmActivityReviewRosterAction({ ...input, memberIds: ["bad"] })).toEqual({ error: "PEER_INVALID_INPUT" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("restores a mistaken cancellation only through the explicit administrator operation with a reason", async () => {
    expect(await restoreReviewRegistrationAction({ roundId, memberId, reason: "核实为误取消报名" })).toEqual({ success: true })
    expect(mocks.requireAdmin).toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledWith("admin_restore_unified_review_registration", {
      p_round_id: roundId, p_member_id: memberId, p_reason: "核实为误取消报名",
    })
    mocks.rpc.mockClear()
    expect(await restoreReviewRegistrationAction({ roundId, memberId, reason: "" })).toEqual({ error: "PEER_REASON_REQUIRED" })
    expect(await restoreReviewRegistrationAction({ roundId, memberId: "bad", reason: "核实为误取消报名" })).toEqual({ error: "PEER_INVALID_INPUT" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
