import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ inspect: vi.fn(), perform: vi.fn(), recover: vi.fn(), list: vi.fn() }))
vi.mock("@/lib/matching/adjustment-service", () => ({ inspectMatchingAdjustment: mocks.inspect, performMatchingAdjustment: mocks.perform, recoverMatchingAdjustmentOperation: mocks.recover, fetchMatchingAdjustmentRecords: mocks.list }))
import { checkGroupCompatibility, checkPairCompatibility, manualPair, recoverMatchingAdjustment, fetchMatchingAdjustments } from "./manual-actions"
beforeEach(() => vi.resetAllMocks())

describe("manual adjustment action boundary", () => {
  it("uses the same server inspection for pair and final multiplayer selection", async () => {
    mocks.inspect.mockResolvedValue({ inspection: { passed: true, reasons: [], bestSlot: "2026-10-24_下午", rows: [{ total_score: 61, score_breakdown: [{ factor: "interest" }] }] }, revisionToken: "revision", canViewRaw: true })
    expect(await checkPairCompatibility("session", "a", "b")).toMatchObject({ compatible: true, revisionToken: "revision", score: 61 })
    expect(mocks.inspect).toHaveBeenLastCalledWith("session", ["a", "b"])
    expect(await checkGroupCompatibility("session", ["a", "b", "c"])).toMatchObject({ compatible: true, score: 61 })
    expect(mocks.inspect).toHaveBeenLastCalledWith("session", ["a", "b", "c"])
  })
  it("does not leak private conflict detail or scoring input to an ordinary administrator", async () => {
    mocks.inspect.mockResolvedValue({ inspection: { passed: false, reasons: ["PRIVATE-BLACKLIST"], bestSlot: null, rows: [] }, revisionToken: "revision", canViewRaw: false })
    const response = await checkGroupCompatibility("session", ["a", "b", "c"])
    expect(response.compatible).toBe(false)
    expect(JSON.stringify(response)).not.toContain("PRIVATE")
    expect(response.breakdown).toEqual([])
    expect(response.scoreBreakdown).toBeNull()
  })
  it("passes stable operation identity and preview revision to the controlled service without a force bypass", async () => {
    mocks.perform.mockResolvedValue({ success: true, operationId: "request" })
    await expect(manualPair("session", ["a", "b"], "核对后配对", "request", "revision")).resolves.toEqual({ success: true, operationId: "request" })
    expect(mocks.perform).toHaveBeenCalledExactlyOnceWith({ sessionId: "session", kind: "manual", memberIds: ["a", "b"], rawReason: "核对后配对", operationId: "request", expectedRevision: "revision" })
  })
  it("restores the original operation rather than silently creating a new one", async () => {
    mocks.recover.mockResolvedValue({ success: true, operationId: "same" })
    await recoverMatchingAdjustment("session", "same", "恢复原操作")
    expect(mocks.recover).toHaveBeenCalledExactlyOnceWith("session", "same", "恢复原操作")
  })
  it("makes record read failure explicit", async () => {
    mocks.list.mockRejectedValue(new Error("private"))
    expect(await fetchMatchingAdjustments("session")).toEqual({ adjustments: [], error: expect.any(String) })
  })
})
