import { describe, expect, it } from "vitest"
import { buildMiniMatchTagGroups, isMiniMatchParticipant, resolveMiniMatchPartner } from "../../packages/miniprogram/src/lib/match-detail"

describe("resolveMiniMatchPartner", () => {
  it("builds group partner summary", () => {
    expect(resolveMiniMatchPartner("m1", ["m1", "m2", "m3"], new Map([
      ["m2", "小林"],
      ["m3", "山田"],
    ]), { member_a_id: "m1", member_b_id: "m2" })).toEqual({
      partnerName: "3人组",
      groupMemberNames: ["小林", "山田"],
      revieweeId: null,
      isGroup: true,
    })
  })

  it("builds pair partner summary", () => {
    expect(resolveMiniMatchPartner("m1", null, new Map([["m2", "小林"]]), {
      member_a_id: "m1",
      member_b_id: "m2",
    })).toEqual({
      partnerName: "小林",
      groupMemberNames: [],
      revieweeId: "m2",
      isGroup: false,
    })
  })

  it("checks participants with the same semantics as web match detail", () => {
    expect(isMiniMatchParticipant("m1", {
      member_a_id: "m1",
      member_b_id: "m2",
      group_members: null,
    })).toBe(true)

    expect(isMiniMatchParticipant("m1", {
      member_a_id: "m9",
      member_b_id: "m8",
      group_members: ["m2", "m1", "m3"],
    })).toBe(true)

    expect(isMiniMatchParticipant("m1", {
      member_a_id: "m9",
      member_b_id: "m8",
      group_members: ["m2", "m3"],
    })).toBe(false)
  })

  it("builds tag groups with the same semantics as web match detail", () => {
    expect(buildMiniMatchTagGroups({
      hobbyTags: ["推理", "电影"],
      gameTypePref: "盒装",
      scenarioThemeTags: ["情感", "还原"],
      expressionStyleTags: ["温和"],
      groupRoleTags: ["组织者"],
    })).toEqual([
      { label: "兴趣标签", tags: ["推理", "电影"] },
      { label: "社交风格", tags: ["温和", "组织者"] },
      { label: "玩本偏好", tags: ["盒装", "情感", "还原"] },
    ])
  })
})
