import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
vi.mock("@/lib/activity-reviews/queries", () => ({ activityReviewRpc: mocks.rpc, activityReviewErrorCode: (error: unknown) => error instanceof Error ? error.message : "PEER_SAVE_FAILED" }))
import { setActivityReviewExemptionAction } from "./actions"

const input = { roundId: "30000000-0000-0000-0000-000000000001", memberId: "10000000-0000-0000-0000-000000000001", exempt: true, expectedVersion: 0, reason: "  工作人员核实未成行  " }
beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockResolvedValue({ role: "admin" }); mocks.rpc.mockResolvedValue({}) })

describe("review exemption server action", () => {
  it("requires administrator authentication before processing a request", async () => {
    mocks.admin.mockRejectedValueOnce(new Error("denied"))
    await expect(setActivityReviewExemptionAction(input)).rejects.toThrow("denied")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each([true, false])("saves exempt=%s for exactly the specified member, round and version", async (exempt) => {
    expect(await setActivityReviewExemptionAction({ ...input, exempt, expectedVersion: 5 })).toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_set_round_review_exemption", { p_round_id: input.roundId, p_member_id: input.memberId, p_exempt: exempt, p_expected_version: 5, p_reason: input.reason.trim() })
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/activity-reviews")
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/matching/survey")
    expect(mocks.revalidate).toHaveBeenCalledWith("/app", "layout")
  })
  it.each([
    { roundId: "other" }, { memberId: "other" }, { expectedVersion: -1 }, { expectedVersion: 1.5 },
    { exempt: "true" }, { reason: "短" }, { reason: "字".repeat(501) },
  ])("rejects invalid requests before RPC access", async (changes) => {
    const result = await setActivityReviewExemptionAction({ ...input, ...changes } as typeof input)
    expect(result.error).toMatch(/^PEER_(INVALID_INPUT|REASON_REQUIRED)$/)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it("retains version conflict without reporting success or revalidating", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("PEER_VERSION_CONFLICT"))
    expect(await setActivityReviewExemptionAction(input)).toEqual({ error: "PEER_VERSION_CONFLICT" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it("counts Unicode code points consistently with the database", async () => {
    const reason = "🧩".repeat(500)
    expect(await setActivityReviewExemptionAction({ ...input, reason })).toEqual({ success: true })
    expect(mocks.rpc.mock.calls[0][1].p_reason).toBe(reason)
  })
})
