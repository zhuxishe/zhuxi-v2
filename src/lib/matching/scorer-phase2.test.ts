import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "./config"
import { scorePair, scorePairFactors } from "./scorer"
import type { MatchCandidate } from "./types"

function candidate(id: string, overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    submissionId: id, name: id, gameTypePref: "双人", genderPref: "都可以",
    availability: { "2026-01-01": ["晚上"] }, formInterestTags: [], formSocialStyle: null,
    gender: "女", school: "甲大学", interestTags: ["桌游", "电影"], socialTags: [],
    level: 2, compatibilityScore: 4, matchHistory: [], gameMode: "推理", hasProfile: true,
    acceptBeginners: false, ...overrides,
  }
}

describe("unchanged factors in duo and whole-pool contexts", () => {
  it("retains the original eight weights and numeric duo score, including experience", () => {
    const a = candidate("A")
    const b = candidate("B", { school: "乙大学", interestTags: ["桌游", "旅行"], level: 0, compatibilityScore: 5 })
    const score = scorePair(a, b, DEFAULT_CONFIG)
    expect(score.hardVeto).toBe(false)
    expect(score.totalScore).toBeCloseTo(69.625)
    expect(score.breakdown.map((part) => part.weight)).toEqual([15, 0, 10, 15, 20, 5, 10, 25])
    expect(score.breakdown.find((part) => part.factor === "level_proximity")?.weightedScore).toBe(4)
  })

  it("can score a legitimate multi-only relationship without applying duo type veto", () => {
    const a = candidate("A", { gameTypePref: "多人" })
    const b = candidate("B", { gameTypePref: "多人" })
    expect(scorePair(a, b, DEFAULT_CONFIG).hardVeto).toBe(true)
    const factors = scorePairFactors(a, b, DEFAULT_CONFIG)
    expect(factors.hardVeto).toBe(false)
    expect(factors.totalScore).toBeGreaterThan(0)
    expect(factors.breakdown).toHaveLength(8)
  })

  it("keeps expired but shared time available because expiry rules are unchanged", () => {
    expect(scorePair(candidate("A"), candidate("B"), DEFAULT_CONFIG).hardVeto).toBe(false)
  })

  it("still vetoes a duo with no shared time before calculating factors", () => {
    const score = scorePair(candidate("A"), candidate("B", { availability: { "2026-01-02": ["晚上"] } }), DEFAULT_CONFIG)
    expect(score.hardVeto).toBe(true)
    expect(score.breakdown).toEqual([])
    expect(score.vetoReasons).toContain("无共同可用时段")
  })
})
