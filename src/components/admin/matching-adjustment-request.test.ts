import { describe, expect, it, vi } from "vitest"
import { clearCompletedMatchingAdjustmentRequests, clearMatchingAdjustmentRequestId, matchingAdjustmentRequestId, releaseFailedMatchingAdjustmentRequest } from "./matching-adjustment-request"
const first = "00000000-0000-4000-8000-000000000001"
const next = "00000000-0000-4000-8000-000000000002"
function storage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) }, key: (index: number) => [...values.keys()][index] ?? null, get length() { return values.size }, values }
}
describe("matching adjustment operation identities", () => {
  it("reuses IDs on retry and order changes, isolating targets, sessions and operation kinds", () => {
    const tab = storage()
    const generate = vi.fn().mockReturnValueOnce(first).mockReturnValue(next)
    expect(matchingAdjustmentRequestId("a", "manual", ["B", "A"], tab, generate)).toBe(first)
    expect(matchingAdjustmentRequestId("a", "manual", ["A", "B", "A"], tab, generate)).toBe(first)
    expect(matchingAdjustmentRequestId("a", "pool", [], tab, generate)).toBe(next)
    expect(matchingAdjustmentRequestId("b", "manual", ["A", "B"], tab, generate)).toBe(next)
    expect(matchingAdjustmentRequestId("a", "manual", ["A", "C"], tab, generate)).toBe(next)
    expect(generate).toHaveBeenCalledTimes(4)
    expect([...tab.values.values()].every((value) => /^[0-9a-f-]+$/.test(value))).toBe(true)
    expect([...tab.values.keys()].join(" ")).not.toContain("reason")
    clearCompletedMatchingAdjustmentRequests("a", [first, next], tab)
    clearCompletedMatchingAdjustmentRequests("b", [next], tab)
  })
  it("only clears acknowledged success; later deliberate operations get a new ID", () => {
    const tab = storage()
    matchingAdjustmentRequestId("success", "restore", ["result"], tab, () => first)
    clearMatchingAdjustmentRequestId("success", "restore", ["result"], tab, next)
    expect(matchingAdjustmentRequestId("success", "restore", ["result"], tab, () => next)).toBe(first)
    clearMatchingAdjustmentRequestId("success", "restore", ["result"], tab, first)
    expect(matchingAdjustmentRequestId("success", "restore", ["result"], tab, () => next)).toBe(next)
    clearCompletedMatchingAdjustmentRequests("success", [next], tab)
  })
  it("acknowledges recovered success after page reload without clearing another session", () => {
    const tab = storage()
    tab.setItem("zhuxishe:admin:matching-adjustment:reloaded:manual:A,B", first)
    tab.setItem("zhuxishe:admin:matching-adjustment:other:pool:", first)
    clearCompletedMatchingAdjustmentRequests("reloaded", [first], tab)
    expect(tab.length).toBe(1)
    expect(matchingAdjustmentRequestId("reloaded", "manual", ["A", "B"], tab, () => next)).toBe(next)
    clearCompletedMatchingAdjustmentRequests("reloaded", [next], tab)
    clearCompletedMatchingAdjustmentRequests("other", [first], tab)
  })
  it("retains an in-memory ID when storage is denied", () => {
    const unavailable = { getItem() { throw new Error("denied") }, setItem() { throw new Error("denied") }, removeItem() { throw new Error("denied") } }
    expect(matchingAdjustmentRequestId("denied", "split", ["result"], unavailable, () => first)).toBe(first)
    expect(matchingAdjustmentRequestId("denied", "split", ["result"], unavailable, () => next)).toBe(first)
    clearMatchingAdjustmentRequestId("denied", "split", ["result"], unavailable, first)
    expect(matchingAdjustmentRequestId("denied", "split", ["result"], unavailable, () => next)).toBe(next)
    clearCompletedMatchingAdjustmentRequests("denied", [next], unavailable)
  })
  it("only releases a terminal failure after an explicit new-operation choice", () => {
    const tab = storage()
    matchingAdjustmentRequestId("terminal", "pool", [], tab, () => first)
    expect(releaseFailedMatchingAdjustmentRequest("terminal", { id: first, status: "running", can_recover: false }, tab)).toBe(false)
    expect(releaseFailedMatchingAdjustmentRequest("terminal", { id: first, status: "failed", can_recover: true }, tab)).toBe(false)
    expect(matchingAdjustmentRequestId("terminal", "pool", [], tab, () => next)).toBe(first)
    expect(releaseFailedMatchingAdjustmentRequest("terminal", { id: first, status: "failed", can_recover: false }, tab)).toBe(true)
    expect(matchingAdjustmentRequestId("terminal", "pool", [], tab, () => next)).toBe(next)
    clearCompletedMatchingAdjustmentRequests("terminal", [next], tab)
  })

})
