import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("./queries", () => ({ activityReviewRpc: mocks.rpc, activityReviewErrorCode: (error: unknown) => error instanceof Error ? error.message : "PEER_SAVE_FAILED" }))
import { fetchAdminReviewRequirements, mapAdminReviewRequirements } from "./requirements-admin"

const roundId = "30000000-0000-0000-0000-000000000001"
const memberId = "10000000-0000-0000-0000-000000000001"
const participant = { member_id: memberId, full_name: "林秋", nickname: "竹叶", state: "exempt", exempt: true, exemption_version: 3, exemption_reason: "工作人员核实未成行" }
const response = { required: true, ended_at: "2026-11-17T15:00:00Z", participants: [participant] }

beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockResolvedValue({ role: "admin" }); mocks.rpc.mockResolvedValue(response) })

describe("administrative review requirement query", () => {
  it("authenticates before querying the selected round only", async () => {
    const result = await fetchAdminReviewRequirements(roundId)
    expect(mocks.admin).toHaveBeenCalledOnce()
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_get_round_review_requirements", { p_round_id: roundId })
    expect(result).toEqual({ status: "ready", data: { required: true, endedAt: response.ended_at, participants: [{ memberId, fullName: "林秋", nickname: "竹叶", state: "exempt", exempt: true, exemptionVersion: 3, exemptionReason: participant.exemption_reason }] } })
  })
  it("does not mask a failed authorization or send an RPC", async () => {
    mocks.admin.mockRejectedValueOnce(new Error("admin denied"))
    await expect(fetchAdminReviewRequirements(roundId)).rejects.toThrow("admin denied")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("does not query malformed identifiers", async () => {
    expect(await fetchAdminReviewRequirements("other-round")).toEqual({ status: "failed" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("keeps a missing migration distinct from a failed lookup without an actionable list", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("PEER_UNAVAILABLE"))
    expect(await fetchAdminReviewRequirements(roundId)).toEqual({ status: "unavailable" })
    mocks.rpc.mockRejectedValueOnce(new Error("PEER_SAVE_FAILED"))
    expect(await fetchAdminReviewRequirements(roundId)).toEqual({ status: "failed" })
  })
  it("preserves a not-in-scope activity without manufacturing an exemption", async () => {
    mocks.rpc.mockResolvedValueOnce({ required: false, ended_at: null, participants: [] })
    expect(await fetchAdminReviewRequirements(roundId)).toEqual({ status: "ready", data: { required: false, endedAt: null, participants: [] } })
  })
  it.each([
    { ...response, required: "true" }, { ...response, ended_at: "invalid" },
    { ...response, participants: [{ ...participant, state: "unknown" }] },
    { ...response, participants: [{ ...participant, exemption_version: -1 }] },
    { ...response, participants: [{ ...participant, exempt: "true" }] },
    { ...response, participants: [participant, participant] },
    { ...response, participants: [{ ...participant, member_id: "invalid" }] },
  ])("rejects malformed responses instead of rendering unsafe controls", async (invalid) => {
    expect(() => mapAdminReviewRequirements(invalid)).toThrow("PEER_INVALID_RESPONSE")
    mocks.rpc.mockResolvedValueOnce(invalid)
    expect(await fetchAdminReviewRequirements(roundId)).toEqual({ status: "failed" })
  })
})
