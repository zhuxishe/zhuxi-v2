import { describe, expect, it } from "vitest"
import { availableSmallGroups, moveSmallGroupCandidate } from "./matching-small-group-local"

const bestSlot = "2026-11-05_下午"
const prefs = Object.fromEntries(["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((id) => [id, { availability: { "2026-11-05": ["下午", "晚上"] } }]))
const groups = [
  { key: "one", memberIds: ["a", "b", "c", "d"], bestSlot, commonSlots: [bestSlot] },
  { key: "two", memberIds: ["e", "f", "g", "h"], bestSlot, commonSlots: [bestSlot] },
]

describe("editable small-group suggestions", () => {
  it("removes assigned people without reallocating anyone in other suggestions", () => {
    const result = availableSmallGroups(groups, ["c", "d", "e", "f", "g", "h", "i"], prefs)
    expect(result.map((group) => group.memberIds)).toEqual([["c", "d"], ["e", "f", "g", "h"]])
    expect(result[1].commonSlots).toEqual([bestSlot, "2026-11-05_晚上"])
    expect(groups[0].memberIds).toEqual(["a", "b", "c", "d"])
  })
  it("moves a suggestion member once and permits a temporary three-person source", () => {
    const result = moveSmallGroupCandidate(groups, "d", "two", prefs)
    expect(result.map((group) => group.memberIds.length)).toEqual([3, 5])
    expect(result.flatMap((group) => group.memberIds).filter((id) => id === "d")).toHaveLength(1)
    expect(groups[0].memberIds).toHaveLength(4)
  })
  it("retains the chosen time and rejects a different-date or different-period newcomer", () => {
    const different = { ...prefs, i: { availability: { "2026-11-05": ["晚上"] } } }
    expect(() => moveSmallGroupCandidate(groups, "i", "one", different)).toThrow("推荐时段")
  })
  it("does not duplicate an existing member or retain emptied suggestions", () => {
    expect(moveSmallGroupCandidate(groups, "a", "one", prefs)).toBe(groups)
    expect(availableSmallGroups(groups, [], prefs)).toEqual([])
  })
})
