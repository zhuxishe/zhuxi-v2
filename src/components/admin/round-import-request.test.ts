import { describe, expect, it, vi } from "vitest"
import { clearRoundImportRequestId, readRoundImportRequestId, roundImportRequestId } from "./round-import-request"

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

describe("Excel import operation identity in a browser tab", () => {
  it("keeps the same ID after interrupted responses and page reloads, without storing workbook data", () => {
    const tab = storage()
    const generate = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(next)
    expect(readRoundImportRequestId("round-a", tab)).toBeNull()
    expect(roundImportRequestId("round-a", tab, generate)).toBe(first)
    expect(readRoundImportRequestId("round-a", tab)).toBe(first)
    expect(roundImportRequestId("round-a", tab, generate)).toBe(first)
    expect(roundImportRequestId("round-b", tab, generate)).toBe(next)
    expect(generate).toHaveBeenCalledTimes(2)
    expect([...tab.values.values()]).toEqual([first, next])
  })

  it("clears only the acknowledged operation so stale responses cannot clear a newer import", () => {
    const tab = storage()
    roundImportRequestId("round-a", tab, () => first)
    clearRoundImportRequestId("round-a", tab, next)
    expect(readRoundImportRequestId("round-a", tab)).toBe(first)
    clearRoundImportRequestId("round-a", tab, first)
    expect(roundImportRequestId("round-a", tab, () => next)).toBe(next)
  })

  it("rejects corrupt IDs and tolerates disabled storage", () => {
    const tab = storage()
    tab.setItem("zhuxishe:admin:round-import-request:round-a", "not-an-operation-id")
    expect(readRoundImportRequestId("round-a", tab)).toBeNull()
    expect(roundImportRequestId("round-a", tab, () => first)).toBe(first)
    const blocked = { getItem() { throw new Error("disabled") }, setItem() { throw new Error("disabled") }, removeItem() { throw new Error("disabled") } }
    expect(readRoundImportRequestId("round-a", blocked)).toBeNull()
    expect(roundImportRequestId("round-a", blocked, () => first)).toBe(first)
    expect(() => clearRoundImportRequestId("round-a", blocked, first)).not.toThrow()
  })
})
