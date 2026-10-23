import { describe, expect, it, vi } from "vitest"
import { clearMatchingRequestId, matchingRequestId } from "./matching-run-request"

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
    values,
  }
}
const first = "00000000-0000-4000-8000-000000000001"
const next = "00000000-0000-4000-8000-000000000002"

describe("matching operation identity in a browser tab", () => {
  it("reuses the operation after a network retry and a page reload, isolating other rounds", () => {
    const tab = storage()
    const generate = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(next)
    expect(matchingRequestId("round-a", tab, generate)).toBe(first)
    expect(matchingRequestId("round-a", tab, generate)).toBe(first)
    expect(matchingRequestId("round-b", tab, generate)).toBe(next)
    expect(generate).toHaveBeenCalledTimes(2)
    expect([...tab.values.values()]).toEqual([first, next])
  })

  it("clears only the acknowledged operation, allowing a deliberate new batch after completion", () => {
    const tab = storage()
    const generate = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(next)
    matchingRequestId("round-a", tab, generate)
    clearMatchingRequestId("round-a", tab, next)
    expect(matchingRequestId("round-a", tab, generate)).toBe(first)
    clearMatchingRequestId("round-a", tab, first)
    expect(matchingRequestId("round-a", tab, generate)).toBe(next)
  })

  it("replaces invalid stored identifiers and tolerates disabled storage", () => {
    const tab = storage()
    tab.setItem("zhuxishe:admin:matching-request:round-a", "broken-id")
    expect(matchingRequestId("round-a", tab, () => first)).toBe(first)
    const unavailable = { getItem() { throw new Error("disabled") }, setItem() { throw new Error("disabled") }, removeItem() { throw new Error("disabled") } }
    expect(matchingRequestId("round-a", unavailable, () => first)).toBe(first)
    expect(() => clearMatchingRequestId("round-a", unavailable, first)).not.toThrow()
  })
})
