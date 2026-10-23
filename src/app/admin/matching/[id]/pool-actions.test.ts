import { beforeEach, expect, it, vi } from "vitest"
const perform = vi.hoisted(() => vi.fn())
vi.mock("@/lib/matching/adjustment-service", () => ({ performMatchingAdjustment: perform }))
import { runPoolRematch } from "./pool-actions"
beforeEach(() => vi.resetAllMocks())
it("runs only the controlled current-session cancellation pool with stable operation identity", async () => {
  perform.mockResolvedValue({ success: true, matchCount: 1 })
  await expect(runPoolRematch("session", "核实取消池后运行", "operation", "revision")).resolves.toEqual({ success: true, matchCount: 1 })
  expect(perform).toHaveBeenCalledExactlyOnceWith({ sessionId: "session", kind: "pool", rawReason: "核实取消池后运行", operationId: "operation", expectedRevision: "revision" })
})
it("keeps publication, qualification and write errors returned by the atomic service", async () => {
  perform.mockResolvedValue({ error: "该匹配已发布，请先撤回发布后再调整" })
  await expect(runPoolRematch("session", "核实取消池后运行", "operation")).resolves.toEqual({ error: "该匹配已发布，请先撤回发布后再调整" })
})
