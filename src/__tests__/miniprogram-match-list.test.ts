import { describe, expect, it } from "vitest"
import { buildMiniMatchList } from "../../packages/miniprogram/src/pages/matches/match-list"

describe("buildMiniMatchList", () => {
  it("keeps group matches in the list and renders member summary", () => {
    const result = buildMiniMatchList(
      "m1",
      [{
        id: "match-1",
        best_slot: "周六晚",
        rank: 1,
        created_at: "2026-04-13T12:00:00.000Z",
        status: "confirmed",
        member_a_id: "m9",
        member_b_id: "m8",
        group_members: ["m1", "m2", "m3"],
      }],
      new Map([
        ["m2", "小林"],
        ["m3", "山田"],
      ]),
      new Set()
    )

    expect(result).toEqual([{
      match: {
        id: "match-1",
        best_slot: "周六晚",
        rank: 1,
        created_at: "2026-04-13T12:00:00.000Z",
        status: "confirmed",
        member_a_id: "m9",
        member_b_id: "m8",
        group_members: ["m1", "m2", "m3"],
      },
      partnerName: "3人组",
      groupMemberNames: ["小林", "山田"],
      revieweeId: null,
      reviewed: false,
      isGroup: true,
    }])
  })
})
