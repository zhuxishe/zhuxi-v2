import { describe, expect, it } from "vitest"
import { buildSessionSummary } from "@/lib/matching/session-summary"

describe("buildSessionSummary", () => {
  it("counts unique active members and excludes cancelled-only members", () => {
    const summary = buildSessionSummary(20, [
      { status: "draft", member_a_id: "a", member_b_id: "b", group_members: null },
      { status: "draft", member_a_id: "c", member_b_id: null, group_members: ["c", "d", "e"] },
      { status: "cancelled", member_a_id: "e", member_b_id: "f", group_members: null },
    ])

    expect(summary).toEqual({
      totalMatched: 5,
      totalUnmatched: 15,
    })
  })
})
