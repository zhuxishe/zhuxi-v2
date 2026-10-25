import { describe, expect, it } from "vitest"
import { getBoardTimeOptions } from "./board-time-options"

type Preferences = Parameters<typeof getBoardTimeOptions>[1]

describe("board multiplayer time options", () => {
  it("shows every all-member common time with the current arrangement first and the rest in calendar order", () => {
    const availability = {
      "2026-11-03": ["晚上", "下午", "上午", "晚上"],
      "2026-11-02": ["晚上", "上午", "下午"],
    }
    const prefs = { a: { availability }, b: { availability: structuredClone(availability) }, c: { availability: structuredClone(availability) } }
    const before = structuredClone(prefs), ids = ["c", "a", "b"]
    const result = getBoardTimeOptions(ids, prefs, "2026-11-03_下午")
    expect(result).toEqual({
      complete: true,
      currentValid: true,
      commonSlots: ["2026-11-03_下午", "2026-11-02_上午", "2026-11-02_下午", "2026-11-02_晚上", "2026-11-03_上午", "2026-11-03_晚上"],
      orderedSlots: [
        { slot: "2026-11-03_下午", position: 1, current: true },
        { slot: "2026-11-02_上午", position: 2, current: false },
        { slot: "2026-11-02_下午", position: 3, current: false },
        { slot: "2026-11-02_晚上", position: 4, current: false },
        { slot: "2026-11-03_上午", position: 5, current: false },
        { slot: "2026-11-03_晚上", position: 6, current: false },
      ],
    })
    expect(prefs).toEqual(before)
    expect(ids).toEqual(["c", "a", "b"])
    expect(getBoardTimeOptions(["b", "a", "c"], prefs, "2026-11-03_下午")).toEqual(result)
  })

  it("does not confuse pairwise overlaps with a full-member intersection", () => {
    const prefs = {
      a: { availability: { "2026-11-01": ["上午", "下午"] } },
      b: { availability: { "2026-11-01": ["上午", "晚上"] } },
      c: { availability: { "2026-11-01": ["下午", "晚上"] } },
    }
    expect(getBoardTimeOptions(["a", "b", "c"], prefs, "2026-11-01_下午"))
      .toEqual({ complete: true, currentValid: false, commonSlots: [], orderedSlots: [] })
  })

  it.each([undefined, {}, { availability: undefined }, { availability: null }])("does not skip a member with missing availability: %j", (missing) => {
    const prefs = { a: { availability: { "2026-11-01": ["上午"] } }, ...(missing ? { b: missing } : {}) } as Preferences
    expect(getBoardTimeOptions(["a", "b"], prefs, "2026-11-01_上午"))
      .toEqual({ complete: false, currentValid: false, commonSlots: [], orderedSlots: [] })
  })

  it("distinguishes a known empty availability from missing data", () => {
    const prefs = { a: { availability: { "2026-11-01": ["上午"] } }, b: { availability: {} } }
    expect(getBoardTimeOptions(["a", "b"], prefs, null))
      .toEqual({ complete: true, currentValid: false, commonSlots: [], orderedSlots: [] })
    expect(getBoardTimeOptions([], {}, "2026-11-01_上午"))
      .toEqual({ complete: true, currentValid: false, commonSlots: [], orderedSlots: [] })
  })

  it.each([
    { "2026-2-03": ["上午"] },
    { "2026-02-30": ["上午"] },
    { "2026-02-29": ["上午"] },
    { "2026-11-01T00:00:00Z": ["上午"] },
    { "2026-11-01": ["全天"] },
    { "2026-11-01": "上午" },
    [],
  ])("rejects malformed dates or periods without inventing availability: %j", (availability) => {
    const prefs = { a: { availability } } as unknown as Preferences
    expect(getBoardTimeOptions(["a"], prefs, null))
      .toEqual({ complete: false, currentValid: false, commonSlots: [], orderedSlots: [] })
  })

  it("accepts real leap-day dates and normalizes only the existing arrangement separator", () => {
    const prefs = { a: { availability: { "2028-02-29": ["下午", "上午"] } } }
    expect(getBoardTimeOptions(["a"], prefs, "2028-02-29 下午")).toMatchObject({
      complete: true, currentValid: true, commonSlots: ["2028-02-29_下午", "2028-02-29_上午"],
    })
  })

  it.each([null, "2026-11-02_上午", "2026-11-01_晚上", "2026-11-01_全天", "2026-11-1_上午"])("never inserts a non-common saved arrangement: %j", (selected) => {
    const prefs = { a: { availability: { "2026-11-01": ["下午", "上午"] } } }
    expect(getBoardTimeOptions(["a"], prefs, selected)).toEqual({
      complete: true, currentValid: false, commonSlots: ["2026-11-01_上午", "2026-11-01_下午"],
      orderedSlots: [{ slot: "2026-11-01_上午", position: 1, current: false }, { slot: "2026-11-01_下午", position: 2, current: false }],
    })
  })

  it.each([{ times: ["下午"] }, { times: ["上午", "下午"] }])("does not fabricate second or third options for only $times", ({ times }) => {
    const result = getBoardTimeOptions(["a"], { a: { availability: { "2026-11-01": times } } }, "2026-11-01_下午")
    expect(result.commonSlots).toHaveLength(times.length)
    expect(result.orderedSlots).toHaveLength(times.length)
    expect(result.orderedSlots.at(-1)?.position).toBe(times.length)
  })

  it("recomputes after removing a limiting member, adding one, and undoing the move", () => {
    const prefs = {
      a: { availability: { "2026-11-01": ["上午", "下午", "晚上"] } },
      b: { availability: { "2026-11-01": ["上午", "下午", "晚上"] } },
      c: { availability: { "2026-11-01": ["下午"] } },
      d: { availability: { "2026-11-01": ["上午", "晚上"] } },
    }
    const original = getBoardTimeOptions(["a", "b", "c"], prefs, "2026-11-01_下午")
    expect(original.commonSlots).toEqual(["2026-11-01_下午"])
    expect(getBoardTimeOptions(["a", "b"], prefs, "2026-11-01_下午").commonSlots)
      .toEqual(["2026-11-01_下午", "2026-11-01_上午", "2026-11-01_晚上"])
    expect(getBoardTimeOptions(["a", "b", "d"], prefs, "2026-11-01_下午"))
      .toMatchObject({ currentValid: false, commonSlots: ["2026-11-01_上午", "2026-11-01_晚上"] })
    expect(getBoardTimeOptions(["a", "b", "c"], prefs, "2026-11-01_下午")).toEqual(original)
  })
})
