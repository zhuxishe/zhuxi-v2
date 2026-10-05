import { describe, expect, it } from "vitest"
import { findMemberConflicts, getMatchMemberIds, type MatchMemberResult } from "./member-conflicts"

const duo: MatchMemberResult = { id: "duo", status: "draft", member_a_id: "A", member_b_id: "B" }

describe("active matching member conflicts", () => {
  it("finds the same member on either side of different pairs", () => {
    const other = { id: "other", status: "locked", member_a_id: "C", member_b_id: "A" }
    expect(findMemberConflicts([duo, other]).get("A")).toEqual([duo, other])
  })

  it("finds conflicts between pairs and groups, and between groups", () => {
    const group = { id: "group", status: "draft", member_a_id: "C", group_members: ["C", "D", "A"] }
    const other = { id: "other", status: "confirmed", member_a_id: "E", group_members: ["E", "F", "D"] }
    const conflicts = findMemberConflicts([duo, group, other])
    expect([...conflicts.keys()]).toEqual(["A", "D"])
    expect(conflicts.get("D")).toEqual([group, other])
  })

  it("counts a group's representative once and ignores repeated copies of the same result", () => {
    const group = { id: "group", status: "draft", member_a_id: "A", group_members: ["A", "B", "C"] }
    expect(getMatchMemberIds(group)).toEqual(["A", "B", "C"])
    expect(findMemberConflicts([group, group]).size).toBe(0)
  })

  it("ignores cancelled results", () => {
    expect(findMemberConflicts([duo, { ...duo, id: "old", status: "cancelled" }]).size).toBe(0)
  })

  it("returns every conflicting result without choosing which one to keep", () => {
    const rows = [duo, { ...duo, id: "second" }, { ...duo, id: "third" }]
    expect(findMemberConflicts(rows).get("A")).toEqual(rows)
  })
})
