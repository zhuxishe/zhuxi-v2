import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "./config"
import { checkGroupConstraints, checkHardConstraints, checkSharedMemberConstraints } from "./constraints"
import { pairKey, type PairRelation } from "./pair-history"
import { scorePair } from "./scorer"
import type { MatchCandidate } from "./types"

function candidate(id: string, overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    submissionId: id,
    name: id,
    gameTypePref: "双人",
    genderPref: "都可以",
    availability: { "2026-10-24": ["下午"] },
    formInterestTags: [],
    formSocialStyle: null,
    gender: "女",
    school: null,
    interestTags: [],
    socialTags: [],
    level: 0,
    compatibilityScore: null,
    matchHistory: [],
    gameMode: null,
    hasProfile: true,
    ...overrides,
  }
}

function relation(status: PairRelation["status"]): Map<string, PairRelation> {
  return new Map([[pairKey("a", "b"), {
    playerA: "a",
    playerB: "b",
    status,
    totalPairCount: 1,
    hasMutualFive: status === "cooldown",
    reason: "历史关系",
  }]])
}

describe("phase 2: beginner acceptance no longer vetoes pairs", () => {
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
    [undefined, undefined],
  ])("acceptBeginners %s / %s preserves legal beginner pairing", (acceptA, acceptB) => {
    const a = candidate("a", { acceptBeginners: acceptA })
    const b = candidate("b", { acceptBeginners: acceptB })

    expect(checkHardConstraints(a, b, DEFAULT_CONFIG)).toEqual({ passed: true, reasons: [] })
    expect(scorePair(a, b, DEFAULT_CONFIG).hardVeto).toBe(false)
  })

  it.each(["a", "b"])("does not reject a beginner when %s is an experienced member declining beginners", (experiencedId) => {
    const a = candidate("a", { level: experiencedId === "a" ? 5 : 0, acceptBeginners: false })
    const b = candidate("b", { level: experiencedId === "b" ? 5 : 0, acceptBeginners: false })

    expect(checkHardConstraints(a, b, DEFAULT_CONFIG).passed).toBe(true)
  })

  it("does not use the retained questionnaire field as a new score penalty", () => {
    const a = candidate("a", { level: 5, acceptBeginners: true })
    const b = candidate("b", { level: 0, acceptBeginners: true })
    const before = scorePair(a, b, DEFAULT_CONFIG)
    const after = scorePair(
      { ...a, acceptBeginners: false },
      { ...b, acceptBeginners: false },
      DEFAULT_CONFIG,
    )

    expect(after).toEqual(before)
    expect(after.breakdown.find((factor) => factor.factor === "level_proximity")?.weight)
      .toBe(DEFAULT_CONFIG.weights.level_proximity)
  })

  it.each(["blacklist", "cooldown"] as const)("still rejects %s relationships", (status) => {
    const result = checkHardConstraints(
      candidate("a", { acceptBeginners: false }),
      candidate("b", { acceptBeginners: false }),
      DEFAULT_CONFIG,
      relation(status),
    )

    expect(result.passed).toBe(false)
    expect(result.reasons.join(" ")).toContain(status === "blacklist" ? "黑名单" : "冷却期")
  })

  it("still rejects taboo conflicts", () => {
    const result = checkHardConstraints(
      candidate("a", { tabooTags: ["竞技"], acceptBeginners: false }),
      candidate("b", { interestTags: ["竞技"], acceptBeginners: false }),
      DEFAULT_CONFIG,
    )

    expect(result.passed).toBe(false)
    expect(result.reasons.join(" ")).toContain("禁忌标签")
  })

  it("still rejects incompatible gender preferences", () => {
    const result = checkHardConstraints(
      candidate("a", { genderPref: "男", acceptBeginners: false }),
      candidate("b", { gender: "女", acceptBeginners: false }),
      DEFAULT_CONFIG,
    )

    expect(result.passed).toBe(false)
    expect(result.reasons.join(" ")).toContain("性别不兼容")
  })

  it("still rejects incompatible game types", () => {
    const result = checkHardConstraints(
      candidate("a", { acceptBeginners: false }),
      candidate("b", { gameTypePref: "多人", acceptBeginners: false }),
      DEFAULT_CONFIG,
    )

    expect(result.passed).toBe(false)
    expect(result.reasons.join(" ")).toContain("游戏类型不兼容")
  })

  it("still rejects pairs without a common time slot", () => {
    const result = scorePair(
      candidate("a", { acceptBeginners: false }),
      candidate("b", { availability: { "2026-10-24": ["晚上"] }, acceptBeginners: false }),
      DEFAULT_CONFIG,
    )

    expect(result.hardVeto).toBe(true)
    expect(result.vetoReasons).toContain("无共同可用时段")
  })
})

describe("phase 2: shared member constraints", () => {
  it("ignores duo type, gender, availability and beginner acceptance", () => {
    const a = candidate("a", {
      gameTypePref: "多人", genderPref: "男", gender: "女",
      availability: {}, acceptBeginners: false,
    })
    const b = candidate("b", {
      gameTypePref: "多人", genderPref: "男", gender: "女",
      availability: {}, acceptBeginners: false,
    })

    expect(checkSharedMemberConstraints(a, b)).toEqual({ passed: true, reasons: [] })
  })

  it.each(["normal", "avoid", "reunion"] as const)("allows %s as a nonblocking history relation", (status) => {
    expect(checkSharedMemberConstraints(candidate("a"), candidate("b"), relation(status)).passed)
      .toBe(true)
  })

  it.each(["interestTags", "socialTags"] as const)("checks taboo conflicts against %s in both directions", (tagField) => {
    const a = candidate("a", { tabooTags: ["竞技"] })
    const b = candidate("b", { [tagField]: ["竞技"] })

    expect(checkSharedMemberConstraints(a, b).passed).toBe(false)
    expect(checkSharedMemberConstraints(b, a).passed).toBe(false)
  })

  it("keeps exact tag matching without inferring free text", () => {
    expect(checkSharedMemberConstraints(
      candidate("a", { tabooTags: ["竞技"] }),
      candidate("b", { interestTags: ["不喜欢竞技"] }),
    ).passed).toBe(true)
  })
})

describe("phase 2: whole multiplayer pool validation", () => {
  function multiplayer(id: string, overrides: Partial<MatchCandidate> = {}): MatchCandidate {
    return candidate(id, { gameTypePref: "多人", ...overrides })
  }

  it("rejects taboo conflicts even when the conflicting members were already in the pool", () => {
    const result = checkGroupConstraints(
      multiplayer("c"),
      [multiplayer("a", { tabooTags: ["竞技"] }), multiplayer("b", { interestTags: ["竞技"] })],
      DEFAULT_CONFIG,
    )

    expect(result.passed).toBe(false)
    expect(result.reasons.join(" ")).toContain("禁忌标签")
  })

  it.each(["blacklist", "cooldown"] as const)("rejects an existing pool pair with %s status", (status) => {
    const result = checkGroupConstraints(
      multiplayer("c"),
      [multiplayer("a"), multiplayer("b")],
      DEFAULT_CONFIG,
      relation(status),
    )

    expect(result.passed).toBe(false)
    expect(result.reasons.join(" ")).toContain(status === "blacklist" ? "黑名单" : "冷却期")
  })

  it("accepts the three-person gender example as a complete pool", () => {
    const result = checkGroupConstraints(
      multiplayer("c", { gender: "女", genderPref: "男" }),
      [
        multiplayer("a", { gender: "男", genderPref: "女" }),
        multiplayer("b", { gender: "女", genderPref: "女" }),
      ],
      DEFAULT_CONFIG,
    )

    expect(result).toEqual({ passed: true, reasons: [] })
  })

  it("rejects a pool if a member's gender preference has no other satisfying member", () => {
    const result = checkGroupConstraints(
      multiplayer("c"),
      [multiplayer("a", { genderPref: "男" }), multiplayer("b")],
      DEFAULT_CONFIG,
    )

    expect(result.passed).toBe(false)
    expect(result.reasons.join(" ")).toContain("组内无人满足")
  })

  it("preserves unknown gender as satisfying an existing gender preference", () => {
    const result = checkGroupConstraints(
      multiplayer("c", { gender: null }),
      [multiplayer("a", { genderPref: "男" }), multiplayer("b")],
      DEFAULT_CONFIG,
    )

    expect(result).toEqual({ passed: true, reasons: [] })
  })

  it("still excludes a duo-only member from the multiplayer pool", () => {
    const result = checkGroupConstraints(
      candidate("c"),
      [multiplayer("a"), multiplayer("b")],
      DEFAULT_CONFIG,
    )

    expect(result.passed).toBe(false)
    expect(result.reasons.join(" ")).toContain("选择了双人")
  })

  it("does not impose a six-member limit or beginner-acceptance veto on the pool", () => {
    const members = Array.from({ length: 8 }, (_, index) => multiplayer(String(index), {
      level: index,
      acceptBeginners: false,
    }))

    expect(checkGroupConstraints(members[0], members.slice(1), DEFAULT_CONFIG))
      .toEqual({ passed: true, reasons: [] })
  })
})
