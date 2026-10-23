import { describe, expect, it } from "vitest"
import { AdjustmentConstraintError, buildManualAdjustment, inspectManualAdjustment, runPoolAdjustment } from "./adjustment-engine"
import { DEFAULT_CONFIG } from "./config"
import { pairKey, type PairRelation } from "./pair-history"
import type { MatchingEngineInput } from "./run-input"
import { runFullMatching } from "./run-matching"
import { scorePairFactors } from "./scorer"
import { createScoringV3Config } from "./scoring-policy"
import type { MatchCandidate, ScoringPolicy } from "./types"

function candidate(id: string, overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return { submissionId: `answer-${id}`, name: id, gameTypePref: "都可以", genderPref: "都可以",
    availability: { "2026-01-01": ["晚上"] }, formInterestTags: [], formSocialStyle: null,
    gender: "女", school: "甲大学", interestTags: ["桌游", "电影"], scoringInterestTags: ["桌游", "电影"],
    socialTags: [], level: 2, compatibilityScore: 4, matchHistory: [], gameMode: "推理", gameModes: ["推理"],
    hasProfile: true, acceptBeginners: false, ...overrides }
}
function engine(candidates: MatchCandidate[]): MatchingEngineInput {
  const policy: ScoringPolicy = { version: "weighted_feedback:1", quizVersionId: "published-quiz-1",
    dimensionWeights: { E: 0.3, A: 0.3, O: 0.15, C: 0.1, N: 0.15 }, activityFeedback: [] }
  return { candidates, config: createScoringV3Config(policy), idMap: candidates.map((c) => [c.submissionId, `member-${c.name}`]),
    pairRelations: [], algorithm_version: "max_coverage_split:3", adapter_version: 2 }
}
function members(input: MatchingEngineInput) { return input.idMap.map(([, memberId]) => memberId) }
function addRelation(input: MatchingEngineInput, i: number, j: number, status: PairRelation["status"]) {
  const a = input.candidates[i].submissionId, b = input.candidates[j].submissionId
  input.pairRelations.push([pairKey(a, b), { playerA: a, playerB: b, status,
    totalPairCount: 1, hasMutualFive: status === "cooldown" || status === "reunion", reason: "existing rule" }])
}

describe("manual final-selection validation and current scoring", () => {
  it("rejects multiplayer-only plus flexible as a duo, consistently with auto matching", () => {
    const input = engine([candidate("A", { gameTypePref: "多人" }), candidate("B")])
    expect(runPoolAdjustment(input, false).totalMatched).toBe(0)
    expect(inspectManualAdjustment(input, members(input))).toMatchObject({ passed: false, rows: [] })
    expect(() => buildManualAdjustment(input, members(input))).toThrow(AdjustmentConstraintError)
  })

  it("rejects a duo-only member in a multiplayer pool", () => {
    const input = engine([candidate("A", { gameTypePref: "双人" }), candidate("B"), candidate("C")])
    expect(inspectManualAdjustment(input, members(input)).reasons).toContain("A选择了双人，不适合多人组")
  })

  it("validates the whole final pool rather than a previously incompatible prefix", () => {
    const input = engine([candidate("A", { gender: "男", genderPref: "女" }),
      candidate("B", { gender: "男", genderPref: "女" }), candidate("C", { gender: "女", genderPref: "男" })])
    expect(inspectManualAdjustment(input, members(input).slice(0, 2)).passed).toBe(false)
    expect(inspectManualAdjustment(input, members(input)).passed).toBe(true)
  })

  it("requires one shared time across the whole pool, not merely pairwise overlap", () => {
    const input = engine([candidate("A", { availability: { "2026-01-01": ["上午", "下午"] } }),
      candidate("B", { availability: { "2026-01-01": ["下午", "晚上"] } }),
      candidate("C", { availability: { "2026-01-01": ["晚上", "上午"] } })])
    expect(inspectManualAdjustment(input, members(input))).toMatchObject({ passed: false, bestSlot: null, rows: [] })
    expect(() => buildManualAdjustment(input, members(input))).toThrow("所有成员没有共同可用时段")
  })

  it.each(["blacklist", "cooldown"] as const)("enforces %s for any pair inside a pool without a bypass", (status) => {
    const input = engine([candidate("A"), candidate("B"), candidate("C"), candidate("D")])
    addRelation(input, 1, 2, status)
    expect(inspectManualAdjustment(input, members(input)).passed).toBe(false)
    expect(() => buildManualAdjustment(input, members(input))).toThrow(AdjustmentConstraintError)
  })

  it("enforces taboo tags for members away from the first member", () => {
    const input = engine([candidate("A"), candidate("B", { tabooTags: ["旅行"] }), candidate("C", { interestTags: ["旅行"] })])
    expect(inspectManualAdjustment(input, members(input)).reasons.some((reason) => reason.includes("禁忌标签"))).toBe(true)
  })

  it("rejects missing, ambiguous, duplicate and too-short selections rather than silently dropping them", () => {
    const input = engine([candidate("A"), candidate("B")])
    expect(inspectManualAdjustment(input, ["member-A"]).passed).toBe(false)
    expect(inspectManualAdjustment(input, ["member-A", "member-A"]).passed).toBe(false)
    expect(inspectManualAdjustment(input, ["member-A", "member-gone"]).passed).toBe(false)
    input.idMap[1][1] = "member-A"
    expect(inspectManualAdjustment(input, ["member-A", "member-B"]).passed).toBe(false)
  })

  it.each(["reunion", "avoid"] as const)("uses exactly the auto duo score, explanation, time and old %s adjustment", (status) => {
    const input = engine([candidate("A", { gameTypePref: "双人" }), candidate("B", { gameTypePref: "双人" })])
    addRelation(input, 0, 1, status)
    const auto = runPoolAdjustment(input, false)
    expect(buildManualAdjustment(input, members(input))).toEqual(auto.rows)
    expect(auto.rows[0].total_score).toBeCloseTo(scorePairFactors(input.candidates[0], input.candidates[1], input.config).totalScore + (status === "reunion" ? 30 : -20))
  })

  it("scores the requested duo instead of quietly substituting a higher scoring outside member", () => {
    const input = engine([candidate("A", { interestTags: [], scoringInterestTags: [] }), candidate("B"), candidate("C")])
    const requested = buildManualAdjustment(input, ["member-A", "member-C"])
    expect(requested).toHaveLength(1)
    expect(requested[0]).toMatchObject({ member_a_id: "member-A", member_b_id: "member-C", group_members: null })
  })

  it("uses the captured published personality dimensions and activity feedback", () => {
    const input = engine([candidate("A", { quizScores: { E: 0, A: 100, O: 0, C: 0, N: 0 } }),
      candidate("B", { quizScores: { E: 100, A: 100, O: 30, C: 100, N: 100 } })])
    input.config = createScoringV3Config({ ...input.config.scoringPolicy!,
      dimensionWeights: { E: 0, A: 0, O: 1, C: 0, N: 0 },
      activityFeedback: [
        { id: "ab", round_id: "review-round", reviewer_id: "answer-A", reviewee_id: "answer-B", score: 5, version: 1 },
        { id: "ba", round_id: "review-round", reviewer_id: "answer-B", reviewee_id: "answer-A", score: 5, version: 1 },
      ],
    })
    const row = buildManualAdjustment(input, members(input))[0]
    const breakdown = row.score_breakdown as { factor: string; weightedScore: number }[]
    expect(breakdown.find((factor) => factor.factor === "personality_compatibility")?.weightedScore).toBe(25)
    expect(breakdown.find((factor) => factor.factor === "activity_feedback")?.weightedScore).toBeCloseTo(20 / 3)
  })

  it("creates one unlimited-size pool with the same average and distribution as auto matching", () => {
    const input = engine(Array.from({ length: 8 }, (_, i) => candidate(String(i), { gameTypePref: "多人", level: i })))
    addRelation(input, 0, 1, "avoid")
    expect(buildManualAdjustment(input, members(input))).toEqual(runPoolAdjustment(input, false).rows)
    expect(buildManualAdjustment(input, members(input))[0]).toMatchObject({ game_type: "多人(重复)",
      score_breakdown: { kind: "multi_pool", pairCount: 28, historyAdjustment: 0 } })
  })

  it("accepts a genuine zero score without reviving the novice restriction", () => {
    const input = engine([candidate("A", { level: 0 }), candidate("B", { level: 20, acceptBeginners: false })])
    input.config = structuredClone(DEFAULT_CONFIG)
    for (const factor of Object.keys(input.config.weights)) input.config.weights[factor as keyof typeof input.config.weights] = 0
    input.algorithm_version = "max_coverage_split:2"; input.adapter_version = 1
    expect(buildManualAdjustment(input, members(input))[0].total_score).toBe(0)
  })

  it("does not mutate frozen inputs or the selected-member array", () => {
    const input = engine([candidate("A"), candidate("B"), candidate("C")]), selection = members(input)
    const before = structuredClone(input), selectedBefore = [...selection]
    buildManualAdjustment(input, selection); runPoolAdjustment(input, false); runPoolAdjustment(input, true)
    expect(input).toEqual(before)
    expect(selection).toEqual(selectedBefore)
  })
})

describe("cancel-pool computation with an existing multiplayer pool", () => {
  it("leaves multiplayer-only applicants waiting and never converts them to duo candidates", () => {
    const input = engine([candidate("A", { gameTypePref: "多人" }), candidate("B", { gameTypePref: "多人" }),
      candidate("C", { gameTypePref: "多人" }), candidate("D", { gameTypePref: "双人" }), candidate("E")])
    const result = runPoolAdjustment(input, true)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ member_a_id: "member-D", member_b_id: "member-E", group_members: null })
    expect(result.unmatchedIds).toEqual(["answer-A", "answer-B", "answer-C"])
    expect(result.totalCandidates).toBe(5); expect(result.totalMatched).toBe(2)
  })

  it("still permits flexible applicants to form duos without building another pool", () => {
    const input = engine(Array.from({ length: 6 }, (_, i) => candidate(String(i))))
    const result = runPoolAdjustment(input, true)
    expect(result.totalMatched).toBe(6)
    expect(result.rows).toHaveLength(3)
    expect(result.rows.every((row) => row.group_members === null)).toBe(true)
  })

  it("enforces the same single-pool boundary on the bounded-search path above 18 candidates", () => {
    const input = engine(Array.from({ length: 21 }, (_, i) => candidate(String(i), { gameTypePref: i < 19 ? "多人" : "双人" })))
    const result = runPoolAdjustment(input, true)
    expect(result.totalMatched).toBe(2)
    expect(result.totalUnmatched).toBe(19)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].group_members).toBeNull()
  })

  it("defaults to the released full-pool behavior when no existing pool blocks creation", () => {
    const input = engine(Array.from({ length: 7 }, (_, i) => candidate(String(i), { gameTypePref: "多人" })))
    expect(runPoolAdjustment(input, false)).toEqual(runFullMatching(input.candidates, input.config, new Map(input.idMap), new Map(input.pairRelations)))
    expect(runPoolAdjustment(input, false).rows[0].group_members).toHaveLength(7)
  })
})
