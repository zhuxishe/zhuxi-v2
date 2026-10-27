import { describe, expect, it } from "vitest"
import { getBoardGroupTimeCandidates } from "./board-group-time-options"

type Preferences = Parameters<typeof getBoardGroupTimeCandidates>[1]

const allDay = { "2026-11-01": ["上午", "下午", "晚上"] }

function preferences(ids: readonly string[], availability: Record<string, string[]> = allDay): Preferences {
  return Object.fromEntries(ids.map((id) => [id, { availability: structuredClone(availability) }]))
}

describe("board group time candidates", () => {
  it("ranks partial shared periods by distinct participant coverage, not full-pool intersection", () => {
    const prefs: Preferences = {
      ...preferences(["a", "b", "c"]),
      d: { availability: { "2026-11-01": ["下午", "晚上"] } },
      e: { availability: { "2026-11-01": ["晚上"] } },
      f: { availability: { "2026-11-02": ["上午"] } },
    }
    const ids = ["a", "b", "c", "d", "e", "f"]
    const before = structuredClone(prefs)
    expect(getBoardGroupTimeCandidates(ids, prefs)).toEqual({
      complete: true,
      candidates: [
        { slot: "2026-11-01_晚上", memberIds: ["a", "b", "c", "d", "e"], count: 5, rank: 1 },
        { slot: "2026-11-01_下午", memberIds: ["a", "b", "c", "d"], count: 4, rank: 2 },
        { slot: "2026-11-01_上午", memberIds: ["a", "b", "c"], count: 3, rank: 3 },
      ],
    })
    expect(prefs).toEqual(before)
    expect(ids).toEqual(["a", "b", "c", "d", "e", "f"])
  })

  it("breaks equal coverage ties chronologically and returns only the first five", () => {
    const ids = ["c", "a", "b"]
    const availability = {
      "2026-11-03": ["晚上", "上午", "下午"],
      "2026-11-02": ["晚上", "下午", "上午"],
    }
    const result = getBoardGroupTimeCandidates(ids, preferences(ids, availability))
    expect(result.complete).toBe(true)
    expect(result.candidates.map(({ slot, rank }) => [slot, rank])).toEqual([
      ["2026-11-02_上午", 1], ["2026-11-02_下午", 2], ["2026-11-02_晚上", 3],
      ["2026-11-03_上午", 4], ["2026-11-03_下午", 5],
    ])
    expect(result.candidates.every((candidate) => candidate.count === 3 && candidate.memberIds.join() === ids.join())).toBe(true)
  })

  it("does not count repeated member IDs or repeated answers as extra participants", () => {
    const prefs = preferences(["a", "b", "c"], { "2026-11-01": ["下午", "下午"] })
    expect(getBoardGroupTimeCandidates(["a", "a", "b"], prefs)).toEqual({ complete: true, candidates: [] })
    expect(getBoardGroupTimeCandidates(["a", "a", "b", "c", "c"], prefs).candidates).toEqual([
      { slot: "2026-11-01_下午", memberIds: ["a", "b", "c"], count: 3, rank: 1 },
    ])
  })

  it("uses only the supplied pool and recalculates candidate coverage after members leave", () => {
    const prefs = preferences(["a", "b", "c", "outside"])
    const result = getBoardGroupTimeCandidates(["a", "b", "c"], prefs)
    expect(result.candidates).toHaveLength(3)
    expect(result.candidates.every((candidate) => candidate.count === 3 && !candidate.memberIds.includes("outside"))).toBe(true)
    expect(getBoardGroupTimeCandidates(["a", "b"], prefs)).toEqual({ complete: true, candidates: [] })
    expect(getBoardGroupTimeCandidates(["a", "b", "c"], prefs)).toEqual(result)
  })

  it("reports complete empty coverage for an empty pool or known empty availability", () => {
    expect(getBoardGroupTimeCandidates([], {})).toEqual({ complete: true, candidates: [] })
    const prefs = { ...preferences(["a", "b", "c"]), d: { availability: {} } }
    expect(getBoardGroupTimeCandidates(["a", "b", "c", "d"], prefs)).toMatchObject({ complete: true })
    expect(getBoardGroupTimeCandidates(["d"], prefs)).toEqual({ complete: true, candidates: [] })
  })

  it.each([
    undefined,
    {},
    { availability: null },
    { availability: [] },
    { availability: { "2026-02-30": ["上午"] } },
    { availability: { "2026-11-01": ["全天"] } },
    { availability: { "2026-11-01": "上午" } },
  ])("fails closed instead of presenting a partial ranking when one member has invalid availability: %j", (invalid) => {
    const prefs = { ...preferences(["a", "b", "c"]), ...(invalid === undefined ? {} : { d: invalid }) } as unknown as Preferences
    expect(getBoardGroupTimeCandidates(["a", "b", "c", "d"], prefs)).toEqual({ complete: false, candidates: [] })
  })
})
