import { describe, expect, it } from "vitest"
import { enrichCandidateForScoringV3, submissionToCandidate } from "./adapter-submission"
import { DEFAULT_CONFIG } from "./config"
import { tryPair } from "./match-utils"
import { pairKey, type PairRelation } from "./pair-history"
import { runFullMatching } from "./run-matching"
import { scorePair, scorePairFactors } from "./scorer"
import { createScoringV3Config, validateScoringPolicy } from "./scoring-policy"
import { experienceBucket, scoreActivityFeedback, scoreExperienceBucket, scoreGameModeSet } from "./score-v3"
import type { ActivityFeedbackRecord, MatchCandidate, MultiPoolScoreBreakdown, ScoringPolicy } from "./types"

function candidate(id: string, overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return { submissionId: id, name: id, gameTypePref: "双人", genderPref: "都可以",
    availability: { "2026-01-01": ["晚上"] }, formInterestTags: [], formSocialStyle: null,
    gender: "女", school: "甲大学", interestTags: ["桌游", "电影"], scoringInterestTags: ["桌游", "电影"],
    socialTags: [], level: 2, compatibilityScore: 4, matchHistory: [], gameMode: "推理", gameModes: ["推理"],
    hasProfile: true, acceptBeginners: false, ...overrides }
}
const defaultPolicy: ScoringPolicy = { version: "weighted_feedback:1", quizVersionId: "published-quiz-1",
  dimensionWeights: { E: 0.3, A: 0.3, O: 0.15, C: 0.1, N: 0.15 }, activityFeedback: [] }
const config = () => createScoringV3Config(defaultPolicy)
function review(reviewer: string, reviewee: string, score: number, round = "round-1", version = 1): ActivityFeedbackRecord {
  return { id: `${round}-${reviewer}-${reviewee}-${version}`, round_id: round, reviewer_id: reviewer, reviewee_id: reviewee, score, version }
}
function feedback(records: ActivityFeedbackRecord[]) {
  return scoreActivityFeedback(candidate("A"), candidate("B"), 10, { ...defaultPolicy, activityFeedback: records })
}
function relationship(status: PairRelation["status"]) {
  return new Map([[pairKey("A", "B"), { playerA: "A", playerB: "B", status,
    totalPairCount: 1, hasMutualFive: status === "reunion" || status === "cooldown", reason: "已有历史规则" }]])
}

describe("versioned 100-point matching policy", () => {
  it("uses exactly the seven approved weights without changing the original config", () => {
    const current = config()
    expect(current.weights).toEqual({ interest_overlap: 25, social_complement: 0, school_diversity: 5,
      compatibility_score: 0, repeat_penalty: 15, gameMode_match: 10, level_proximity: 10,
      personality_compatibility: 25, activity_feedback: 10 })
    expect(Object.values(current.weights).reduce((sum, value) => sum + value, 0)).toBe(100)
    expect(DEFAULT_CONFIG.weights.compatibility_score).toBe(15)
    expect(DEFAULT_CONFIG.weights.interest_overlap).toBe(15)
    expect(DEFAULT_CONFIG.scoringPolicy).toBeUndefined()
  })

  it("copies captured policy so later draft or live data edits cannot alter the run", () => {
    const policy = structuredClone(defaultPolicy)
    policy.activityFeedback = [review("A", "B", 5)]
    const current = createScoringV3Config(policy)
    policy.dimensionWeights.E = 0.9
    policy.activityFeedback[0].score = 1
    expect(current.scoringPolicy?.dimensionWeights.E).toBe(0.3)
    expect(current.scoringPolicy?.activityFeedback[0].score).toBe(5)
  })

  it("accepts the same floating-point weight tolerance as questionnaire publishing", () => {
    const allowed = { ...defaultPolicy, dimensionWeights: { ...defaultPolicy.dimensionWeights, N: 0.1500008 } }
    expect(() => validateScoringPolicy(allowed)).not.toThrow()
    const invalid = { ...defaultPolicy, dimensionWeights: { ...defaultPolicy.dimensionWeights, N: 0.150002 } }
    expect(() => validateScoringPolicy(invalid)).toThrow()
  })

  it.each([
    { ...defaultPolicy, quizVersionId: "" },
    { ...defaultPolicy, version: "weighted_feedback:2" },
    { ...defaultPolicy, dimensionWeights: { E: 0.3, A: 0.3, O: 0.15, C: 0.1, N: 0.3 } },
    { ...defaultPolicy, dimensionWeights: { E: -0.1, A: 0.4, O: 0.2, C: 0.2, N: 0.3 } },
    { ...defaultPolicy, activityFeedback: [review("A", "A", 3)] },
    { ...defaultPolicy, activityFeedback: [review("A", "B", 6)] },
    { ...defaultPolicy, activityFeedback: [review("A", "B", 3.1)] },
    { ...defaultPolicy, activityFeedback: [{ ...review("A", "B", 3), comment: "私密评论" }] },
  ])("rejects invalid frozen weights or feedback %#", (policy) => {
    expect(() => validateScoringPolicy(policy)).toThrow()
  })

  it("uses the published dimensional weights while retaining the O formula", () => {
    const a = candidate("A", { quizScores: { E: 0, A: 100, O: 0, C: 0, N: 0 } })
    const b = candidate("B", { quizScores: { E: 100, A: 100, O: 30, C: 100, N: 100 } })
    const current = createScoringV3Config({ ...defaultPolicy, dimensionWeights: { E: 0, A: 0, O: 1, C: 0, N: 0 } })
    const factor = scorePairFactors(a, b, current).breakdown.find((part) => part.factor === "personality_compatibility")!
    expect(factor.weightedScore).toBe(25)
    b.quizScores!.O = 10
    expect(scorePairFactors(a, b, current).breakdown.find((part) => part.factor === "personality_compatibility")?.weightedScore).toBe(17.5)
    b.quizScores!.O = 60
    expect(scorePairFactors(a, b, current).breakdown.find((part) => part.factor === "personality_compatibility")?.weightedScore).toBe(12.5)
  })

  it("admin composite scores have no influence on new scores or breakdowns", () => {
    const a = candidate("A"), b = candidate("B")
    const before = scorePair(a, b, config())
    a.compatibilityScore = 1; b.compatibilityScore = 5
    expect(scorePair(a, b, config())).toEqual(before)
    expect(before.breakdown.find((factor) => factor.factor === "compatibility_score")?.weightedScore).toBe(0)
  })

  it("retains original numeric and breakdown output for version 2, ignoring new optional inputs", () => {
    const a = candidate("A")
    const b = candidate("B", { school: "乙大学", interestTags: ["桌游", "旅行"], level: 0, compatibilityScore: 5 })
    const before = scorePair(a, b, DEFAULT_CONFIG)
    expect(before.totalScore).toBe(69.625)
    expect(before.breakdown.map((part) => part.weight)).toEqual([15, 0, 10, 15, 20, 5, 10, 25])
    a.gameModes = ["欢乐", "推理"]; a.scoringInterestTags = []
    expect(scorePair(a, b, DEFAULT_CONFIG)).toEqual(before)
    expect(tryPair([a, b], 0, 1, DEFAULT_CONFIG, relationship("reunion"), false)?.score).toEqual({ ...before, totalScore: 99.625 })
  })
})

describe("mode sets and activity count buckets", () => {
  it("compares the complete mode sets irrespective of answer order or duplicates", () => {
    const a = candidate("A", { gameModes: ["推理", "情感", "推理"] })
    const b = candidate("B", { gameModes: ["情感", "推理"] })
    expect(scoreGameModeSet(a, b, 10).weightedScore).toBe(10)
    b.gameModes = ["情感", "欢乐"]
    expect(scoreGameModeSet(a, b, 10).weightedScore).toBeCloseTo(10 / 3)
    b.gameModes = []
    expect(scoreGameModeSet(a, b, 10).weightedScore).toBe(5)
    b.gameModes = ["都行"]
    expect(scoreGameModeSet(a, b, 10).weightedScore).toBe(7)
  })

  it("removes modes from scoring interests but preserves original taboo inputs and v2 candidates", () => {
    const sub = { member_id: "A", interest_tags: ["桌游", "推理"], availability: { "2026-01-01": ["晚上"] } }
    const member = { member_identity: { full_name: "A", hobby_tags: ["音乐"] },
      member_interests: { scenario_mode_pref: ["推理", "情感"], scenario_theme_tags: ["悬疑"] } }
    const original = submissionToCandidate(sub, member, [])
    const enriched = enrichCandidateForScoringV3(sub, member, original)
    expect(original.gameModes).toBeUndefined()
    expect(original.interestTags).toEqual(["桌游", "推理", "音乐", "情感", "悬疑"])
    expect(enriched.interestTags).toEqual(original.interestTags)
    expect(enriched.scoringInterestTags).toEqual(["桌游", "音乐", "悬疑"])
    expect(enriched.gameModes).toEqual(["推理", "情感"])
    const b = candidate("B", { tabooTags: ["情感"] })
    expect(scorePair(enriched, b, config()).hardVeto).toBe(true)
  })

  it.each([[0, 0], [1, 1], [2, 1], [3, 2], [5, 2], [6, 3], [10, 3], [11, 4], [200, 4]])("places %i activities in bucket %i", (count, bucket) => {
    expect(experienceBucket(count)).toBe(bucket)
  })
  it("treats bucket gaps as soft scores and retains newbie coverage", () => {
    expect(scoreExperienceBucket(candidate("A", { level: 11 }), candidate("B", { level: 200 }), 10).weightedScore).toBe(10)
    expect(scoreExperienceBucket(candidate("A", { level: 0 }), candidate("B", { level: 11 }), 10).weightedScore).toBe(0)
    expect(scoreExperienceBucket(candidate("A", { level: 2 }), candidate("B", { level: 3 }), 10).weightedScore).toBe(7.5)
    expect(runFullMatching([candidate("A", { level: 0 }), candidate("B", { level: 200 })], config(), new Map()).totalMatched).toBe(2)
  })
})

describe("pair-specific new activity feedback", () => {
  it("uses five neutral points when neither side has a review", () => { expect(feedback([]).weightedScore).toBe(5) })
  it("shrinks a single mutual five rather than assigning ten points", () => {
    expect(feedback([review("A", "B", 5), review("B", "A", 5)]).weightedScore).toBeCloseTo(20 / 3)
  })
  it("uses the lower adjusted direction", () => {
    expect(feedback([review("A", "B", 5), review("B", "A", 1)]).weightedScore).toBeCloseTo(10 / 3)
    expect(feedback([review("A", "B", 5)]).weightedScore).toBe(5)
  })
  it("an edit replaces the activity sample; a distinct activity adds a sample", () => {
    const records = [review("A", "B", 1), review("A", "B", 5, "round-1", 2), review("B", "A", 5)]
    expect(feedback(records).weightedScore).toBeCloseTo(20 / 3)
    expect(feedback([...records].reverse()).weightedScore).toBeCloseTo(20 / 3)
    records.push(review("A", "B", 5, "round-2"), review("B", "A", 5, "round-2"))
    expect(feedback(records).weightedScore).toBe(7.5)
  })
  it("does not create global reputation, blacklist or cooldown from new reviews", () => {
    const current = createScoringV3Config({ ...defaultPolicy, activityFeedback: [review("A", "B", 1), review("B", "A", 5), review("C", "A", 1)] })
    const result = scorePair(candidate("A"), candidate("B"), current)
    expect(result.hardVeto).toBe(false)
    expect(scoreActivityFeedback(candidate("A"), candidate("D"), 10, current.scoringPolicy!).weightedScore).toBe(5)
    expect(runFullMatching([candidate("A"), candidate("B")], current, new Map()).totalMatched).toBe(2)
  })
})

describe("unchanged historical adjustments and explainable single pool", () => {
  it.each([["reunion", 30], ["avoid", -20]] as const)("retains %s adjustment %i and exposes it separately", (status, adjustment) => {
    const current = config(), a = candidate("A"), b = candidate("B")
    const base = scorePair(a, b, current)
    const pair = tryPair([a, b], 0, 1, current, relationship(status), false)!
    expect(pair.score.totalScore).toBe(base.totalScore + adjustment)
    expect(pair.score.breakdown.find((factor) => factor.factor === "history_adjustment")).toMatchObject({ weight: 0, weightedScore: adjustment })
    expect(pair.score.breakdown.reduce((sum, factor) => sum + factor.weightedScore, 0)).toBeCloseTo(pair.score.totalScore)
  })
  it.each(["blacklist", "cooldown"] as const)("retains the existing %s hard veto", (status) => {
    expect(runFullMatching([candidate("A"), candidate("B")], config(), new Map(), relationship(status)).totalMatched).toBe(0)
  })
  it("retains one pool beyond six members and summarizes all pair scores without adding duo bonuses", () => {
    const candidates = Array.from({ length: 8 }, (_, i) => candidate(i === 0 ? "A" : i === 1 ? "B" : `P${i}`, { gameTypePref: "多人", level: i }))
    const current = createScoringV3Config({ ...defaultPolicy, activityFeedback: [review("A", "B", 5)] })
    const result = runFullMatching(candidates, current, new Map(), relationship("reunion"))
    expect(result.totalMatched).toBe(8)
    expect(result.rows).toHaveLength(1)
    const breakdown = result.rows[0].score_breakdown as MultiPoolScoreBreakdown
    expect(breakdown.kind).toBe("multi_pool")
    expect(breakdown.pairCount).toBe(28)
    expect(breakdown.feedbackPairCount).toBe(1)
    expect(breakdown.historyAdjustment).toBe(0)
    expect(breakdown.factors.some((factor) => factor.factor === "history_adjustment")).toBe(false)
    expect(Object.values(breakdown.pairScoreDistribution).reduce((sum, count) => sum + count, 0)).toBe(28)
    const averages = candidates.map((a) => candidates.filter((b) => b !== a).reduce((sum, b) => sum + scorePairFactors(a, b, current).totalScore, 0) / 7)
    expect(breakdown.minimumMemberAverage).toBeCloseTo(Math.min(...averages))
    expect(breakdown.memberAverageDistribution.max).toBeCloseTo(Math.max(...averages))
    expect(result.rows[0].total_score).toBe(Math.round(breakdown.factors.reduce((sum, factor) => sum + factor.weightedScore, 0) * 10) / 10)
    expect(runFullMatching(candidates, DEFAULT_CONFIG, new Map()).rows[0].score_breakdown).toBeNull()
  })
})
