import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "./config"
import { pairKey } from "./pair-history"
import { prepareMatchingRunInput } from "./run-input"
import { runFullMatching } from "./run-matching"

const mocks = vi.hoisted(() => ({
  submissions: [] as Record<string, unknown>[],
  history: [] as Record<string, unknown>[],
  blacklist: [] as Record<string, unknown>[],
  feedbacks: [] as Record<string, unknown>[],
  queries: [] as string[],
}))

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: async () => ({ id: "admin" }) }))
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      mocks.queries.push(table)
      const query = { select: () => query, eq: () => query, in: () => query, order: async () => ({ data: mocks.submissions, error: null }) }
      return query
    },
  }),
}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      mocks.queries.push(table)
      const rows = table === "match_results" ? mocks.history : table === "pair_relationships" ? mocks.blacklist : mocks.feedbacks
      const query = { select: () => query, eq: () => query, or: async () => ({ data: rows, error: null }) }
      return query
    },
  }),
}))

import { buildRoundCandidates } from "./build-round-candidates"
import { fetchPairRelations } from "@/lib/queries/pair-relations-build"

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const ROUND = id(90)
const MEMBER_A = id(1)
const MEMBER_B = id(2)
const MEMBER_C = id(3)
const ready = { supplementary: true, personality: true, quiz: true, missing: [] }

function submission(memberId: string, name: string, index: number) {
  return {
    id: id(100 + index),
    round_id: ROUND,
    member_id: memberId,
    created_at: `2026-10-${String(23 - index).padStart(2, "0")}T00:00:00Z`,
    updated_at: "2026-10-23T00:00:00Z",
    cancelled_at: null,
    game_type_pref: "都可以",
    gender_pref: "都可以",
    availability: { "2026-11-01": ["下午", "晚上"] },
    interest_tags: ["推理", name],
    social_style: "慢热",
    message: null,
    import_metadata: null,
    member: {
      id: memberId,
      status: "approved",
      account_status: "active",
      membership_type: "player",
      record_scope: "current",
      user_id: id(200 + index),
      anonymized_at: null,
      record_source: "app",
      member_number: `TEST-${index}`,
      attractiveness_score: 4,
      member_identity: { full_name: name, gender: "female", school_name: "大学", hobby_tags: ["电影"], personality_self_tags: ["温和"] },
      member_personality: { warmup_speed: "慢热", expression_style_tags: ["倾听"], group_role_tags: [] },
      member_interests: { scenario_mode_pref: ["推理", "情感"], scenario_theme_tags: ["悬疑"], accept_beginners: true, accept_cross_school: true },
      member_language: { communication_language_pref: ["中文"], japanese_level: "N2" },
      member_boundaries: { taboo_tags: ["恐怖"], deal_breakers: [] },
      member_dynamic_stats: { activity_count: 2, reliability_score: 5 },
      personality_quiz_results: [{ score_e: 40, score_a: 60, score_o: 55, score_c: 50, score_n: 45 }],
    },
  }
}

function fixture() {
  return {
    snapshot_id: id(900),
    captured_at: "2026-10-23T01:00:00Z",
    source: {
      round: { id: ROUND, status: "open", purpose: "matching", survey_start: "2026-10-01T00:00:00Z", survey_end: "2026-10-31T00:00:00Z" },
      submissions: [submission(MEMBER_A, "甲", 1), submission(MEMBER_B, "乙", 2), submission(MEMBER_C, "丙", 3)],
      eligibility: [MEMBER_A, MEMBER_B, MEMBER_C].map((member_id) => ({ member_id, eligible: true, reasons: [] as string[], readiness: structuredClone(ready), import_exempt: false })),
      history_results: [
        { id: id(401), member_a_id: MEMBER_A, member_b_id: MEMBER_B, group_members: null as string[] | null },
        { id: id(402), member_a_id: MEMBER_A, member_b_id: null as string | null, group_members: [MEMBER_A, MEMBER_B, MEMBER_C, MEMBER_C] as string[] | null },
        { id: id(401), member_a_id: MEMBER_A, member_b_id: MEMBER_B, group_members: null as string[] | null },
      ],
      blacklist: [{ member_a_id: MEMBER_B, member_b_id: MEMBER_C, notes: "明确禁配", status: "blacklist" }],
      feedbacks: [
        { reviewer_id: MEMBER_A, reviewee_id: MEMBER_B, overall_score: 5 as number | null },
        { reviewer_id: MEMBER_A, reviewee_id: MEMBER_B, overall_score: 1 as number | null },
        { reviewer_id: MEMBER_B, reviewee_id: MEMBER_A, overall_score: 5 as number | null },
      ],
      questionnaire_refs: [{ member_id: MEMBER_A, kind: "quiz", version_id: id(700), response_id: id(701), revision: 1, completed_at: "2026-10-01T00:00:00Z" }],
    },
  }
}

function scoringFixture() {
  const capture = fixture()
  return {
    ...capture,
    source: {
      ...capture.source,
      algorithm_version: "max_coverage_split:3",
      adapter_version: 2,
      scoring_policy: {
        version: "weighted_feedback:1",
        quizVersionId: id(800),
        dimensionWeights: { E: 0.3, A: 0.3, O: 0.15, C: 0.1, N: 0.15 },
        activityFeedback: [{ id: id(810), round_id: id(811), reviewer_id: MEMBER_A, reviewee_id: MEMBER_C, score: 1, version: 2 }],
      },
    },
  }
}

describe("captured matching run inputs", () => {
  beforeEach(() => {
    mocks.queries.length = 0
    mocks.submissions = []
    mocks.history = []
    mocks.blacklist = []
    mocks.feedbacks = []
  })

  it("produces the same candidates, pair relations and matching output as the existing live-read pipeline", async () => {
    const capture = fixture()
    mocks.submissions = capture.source.submissions
    mocks.history = capture.source.history_results
    mocks.blacklist = capture.source.blacklist
    mocks.feedbacks = capture.source.feedbacks
    const old = await buildRoundCandidates(ROUND)
    const ids = old.submissions.map((row) => row.member_id as string)
    const oldRelations = await fetchPairRelations(ids)
    const oldIdMap = new Map(ids.map((memberId) => [memberId, memberId]))

    const prepared = prepareMatchingRunInput(capture)
    expect(prepared.candidates).toEqual(old.candidates)
    expect(prepared.pairRelations).toEqual(oldRelations)
    expect(prepared.idMap).toEqual(oldIdMap)
    expect(prepared.config).toEqual(DEFAULT_CONFIG)
    expect(runFullMatching(prepared.candidates, prepared.config, prepared.idMap, prepared.pairRelations))
      .toEqual(runFullMatching(old.candidates, DEFAULT_CONFIG, oldIdMap, oldRelations))
    expect(prepared.candidates[0].matchHistory).toEqual([{ name: MEMBER_B, count: 2 }, { name: MEMBER_C, count: 1 }])
    expect(prepared.pairRelations.get(pairKey(MEMBER_A, MEMBER_B))).toMatchObject({ hasMutualFive: true, totalPairCount: 2, status: "reunion" })
    expect(prepared.pairRelations.get(pairKey(MEMBER_B, MEMBER_C))).toMatchObject({ status: "blacklist" })
  })

  it("keeps the captured registration order and includes members who already have a confirmed match", () => {
    const capture = fixture()
    capture.source.submissions.reverse()
    const prepared = prepareMatchingRunInput(capture)
    expect(prepared.candidates.map((candidate) => candidate.submissionId)).toEqual([MEMBER_C, MEMBER_B, MEMBER_A])
    expect(prepared.submissions.map((row) => row.member_id)).toEqual([MEMBER_C, MEMBER_B, MEMBER_A])
    expect(prepared.candidates).toHaveLength(3)
    expect(prepared.exclusions).toEqual([])
    expect(mocks.queries).toEqual([])
  })

  it("uses authoritative eligibility reasons and excludes only those declared ineligible", () => {
    const capture = fixture()
    capture.source.eligibility[1] = { ...capture.source.eligibility[1], eligible: false, reasons: ["account_unavailable", "profile_incomplete"], readiness: { ...ready, quiz: false, missing: ["quiz"] } as typeof ready }
    capture.source.eligibility[2] = { ...capture.source.eligibility[2], eligible: false, reasons: ["cancelled"] }
    capture.source.submissions[2].cancelled_at = "2026-10-22T00:00:00Z" as unknown as null
    const prepared = prepareMatchingRunInput(capture)
    expect(prepared.candidates.map((candidate) => candidate.submissionId)).toEqual([MEMBER_A])
    expect(prepared.idMap.size).toBe(1)
    expect(prepared.exclusions.map((row) => ({ member_id: row.member_id, reasons: row.reasons }))).toEqual([
      { member_id: MEMBER_B, reasons: ["account_unavailable", "profile_incomplete"] },
      { member_id: MEMBER_C, reasons: ["cancelled"] },
    ])
  })

  it.each(["temp", "legacy-temp"])("keeps the existing %s offline import exception and merges imported history without changing pair relations", (source) => {
    const capture = fixture()
    const member = capture.source.submissions[0].member
    Object.assign(member, { account_status: "unbound", record_scope: "historical", user_id: null, record_source: "import", member_number: "IMP-00000000-001" })
    capture.source.submissions[0].import_metadata = {
      source, normalized_name: "甲", legacy_profile: { full_name: "甲", interest_tags: ["旧兴趣"], social_tags: ["旧标签"], session_count: 3, compatibility_score: 4.3, match_history: [{ name: MEMBER_C, count: 2 }] },
    } as unknown as null
    capture.source.eligibility[0].import_exempt = true
    capture.source.eligibility[0].readiness = { supplementary: false, personality: false, quiz: false, missing: ["supplementary", "personality", "quiz"] } as typeof ready
    const prepared = prepareMatchingRunInput(capture)
    expect(prepared.candidates).toHaveLength(3)
    expect(prepared.candidates[0].interestTags).toContain("旧兴趣")
    expect(prepared.candidates[0].matchHistory).toEqual([{ name: MEMBER_B, count: 2 }, { name: MEMBER_C, count: 3 }])
    // Imported name-based history is used by the existing candidate adapter, but
    // fetchPairRelations has always used confirmed result history separately.
    expect(prepared.pairRelations.get(pairKey(MEMBER_A, MEMBER_C))?.totalPairCount).toBe(1)
  })

  it("preserves the current-member import completion exception", () => {
    const capture = fixture()
    capture.source.submissions[0].import_metadata = { source: "current", normalized_name: "甲", matched_member_id: MEMBER_A } as unknown as null
    capture.source.eligibility[0].import_exempt = true
    capture.source.eligibility[0].readiness = { supplementary: false, personality: false, quiz: false, missing: ["supplementary", "personality", "quiz"] } as typeof ready
    expect(prepareMatchingRunInput(capture).candidates).toHaveLength(3)
  })

  it("captures configuration and input data independently from subsequent source and runtime mutations", () => {
    const capture = fixture()
    const prepared = prepareMatchingRunInput(capture)
    const stored = structuredClone(prepared.engineInput)
    capture.source.submissions[0].availability["2026-11-01"].push("上午")
    capture.source.submissions[0].member.member_identity.full_name = "后来的姓名"
    capture.source.feedbacks[0].overall_score = 1
    prepared.candidates[0].interestTags.push("后来的兴趣")
    prepared.config.weights.interest_overlap = 100
    prepared.pairRelations.clear()
    prepared.idMap.clear()
    expect(prepared.engineInput).toEqual(stored)
    expect(prepared.engineInput.candidates[0].name).toBe("甲")
    expect(prepared.engineInput.candidates[0].availability["2026-11-01"]).toEqual(["下午", "晚上"])
    expect(DEFAULT_CONFIG.weights.interest_overlap).toBe(15)
    expect(prepared.engineInput).toMatchObject({ algorithm_version: "max_coverage_split:2", adapter_version: 1 })
  })

  it("uses only the captured published dimension weights and numeric reviews for a new policy run", () => {
    const capture = scoringFixture()
    const original = structuredClone(capture)
    const prepared = prepareMatchingRunInput(capture)
    expect(prepared.engineInput).toMatchObject({ algorithm_version: "max_coverage_split:3", adapter_version: 2 })
    expect(prepared.config.scoringPolicy).toEqual(capture.source.scoring_policy)
    expect(Object.values(prepared.config.weights).reduce((sum, weight) => sum + (weight ?? 0), 0)).toBe(100)
    expect(prepared.config.weights.compatibility_score).toBe(0)
    expect(prepared.candidates).toHaveLength(3)
    expect(prepared.candidates[0].gameModes).toEqual(["推理", "情感"])
    expect(prepared.candidates[0].scoringInterestTags).not.toContain("推理")
    // Mode tags still participate in the unchanged taboo/hard-veto path.
    expect(prepared.candidates[0].interestTags).toContain("推理")
    // A new activity score of 1 is a soft relationship input, never an automatic blacklist.
    expect(prepared.pairRelations.get(pairKey(MEMBER_A, MEMBER_C))?.status).not.toBe("blacklist")
    expect(prepared.pairRelations.get(pairKey(MEMBER_A, MEMBER_B))?.status).toBe("reunion")
    expect(mocks.queries).toEqual([])
    expect(capture).toEqual(original)
  })

  it("freezes the new policy with its run instead of following later published weights or review edits", () => {
    const capture = scoringFixture()
    const prepared = prepareMatchingRunInput(capture)
    const frozen = structuredClone(prepared.engineInput)
    capture.source.scoring_policy.dimensionWeights = { E: 1, A: 0, O: 0, C: 0, N: 0 }
    capture.source.scoring_policy.quizVersionId = id(900)
    capture.source.scoring_policy.activityFeedback[0].score = 5
    prepared.config.scoringPolicy!.activityFeedback[0].score = 4
    expect(prepared.engineInput).toEqual(frozen)
    expect(prepareMatchingRunInput(capture).engineInput.config.scoringPolicy?.dimensionWeights.E).toBe(1)
    expect(prepareMatchingRunInput(fixture()).engineInput.config).toEqual(DEFAULT_CONFIG)
  })

  it.each([
    { algorithm_version: "max_coverage_split:3", adapter_version: 1 },
    { algorithm_version: "max_coverage_split:2", adapter_version: 2 },
    { algorithm_version: "max_coverage_split:4", adapter_version: 3 },
    { algorithm_version: "max_coverage_split:3" },
  ])("refuses mixed or unsupported raw capture versions %j", (versions) => {
    expect(() => prepareMatchingRunInput({ ...fixture(), source: { ...fixture().source, ...versions } })).toThrow("VERSION_UNSUPPORTED")
  })

  it.each([
    (capture: ReturnType<typeof scoringFixture>) => { capture.source.scoring_policy.dimensionWeights.E = 0.9 },
    (capture: ReturnType<typeof scoringFixture>) => { capture.source.scoring_policy.activityFeedback[0].score = 0 },
    (capture: ReturnType<typeof scoringFixture>) => { capture.source.scoring_policy.activityFeedback[0].version = 0 },
    (capture: ReturnType<typeof scoringFixture>) => { capture.source.scoring_policy.quizVersionId = "" },
    (capture: ReturnType<typeof scoringFixture>) => { delete (capture.source as Record<string, unknown>).scoring_policy },
  ])("does not silently fall back to legacy defaults when a new capture policy is invalid", (change) => {
    const capture = scoringFixture()
    change(capture)
    expect(() => prepareMatchingRunInput(capture)).toThrow()
  })

  it("does not graft a scoring policy onto an old pre-stage capture", () => {
    expect(() => prepareMatchingRunInput({ ...fixture(), source: { ...fixture().source, scoring_policy: scoringFixture().source.scoring_policy } })).toThrow("legacy version")
  })

  it("accepts nullable version references and an ineligible missing member without restoring it", () => {
    const capture = fixture()
    capture.source.questionnaire_refs[0].response_id = null as unknown as string
    capture.source.questionnaire_refs[0].version_id = null as unknown as string
    capture.source.submissions[0].member = null as unknown as typeof capture.source.submissions[0]["member"]
    capture.source.eligibility[0] = { ...capture.source.eligibility[0], eligible: false, reasons: ["member_not_found"] }
    expect(prepareMatchingRunInput(capture).candidates.map((candidate) => candidate.submissionId)).toEqual([MEMBER_B, MEMBER_C])
  })

  it("does not let unused malformed historical answers or metadata from an excluded row block eligible candidates", () => {
    const capture = fixture()
    capture.source.eligibility[2] = { ...capture.source.eligibility[2], eligible: false, reasons: ["account_unavailable"] }
    capture.source.submissions[2].availability = "old unused answer" as unknown as typeof capture.source.submissions[2]["availability"]
    capture.source.submissions[2].member.member_identity.hobby_tags = "old unused tags" as unknown as string[]
    capture.source.submissions[2].import_metadata = { source: "legacy-temp", normalized_name: "丙", legacy_profile: { match_history: "old unused metadata" } } as unknown as null
    const original = structuredClone(capture)
    const prepared = prepareMatchingRunInput(capture)
    expect(prepared.candidates.map((candidate) => candidate.submissionId)).toEqual([MEMBER_A, MEMBER_B])
    expect(prepared.exclusions).toEqual([capture.source.eligibility[2]])
    expect(capture).toEqual(original)
  })

  it.each([null, {}, [], "old metadata", { source: "current" }, { normalized_name: "甲" }])(
    "keeps the old adapter's no-import fallback for historical metadata %j", async (metadata) => {
      const capture = fixture()
      capture.source.submissions[0].import_metadata = metadata as unknown as null
      mocks.submissions = capture.source.submissions
      mocks.history = capture.source.history_results
      const old = await buildRoundCandidates(ROUND)
      expect(prepareMatchingRunInput(capture).candidates).toEqual(old.candidates)
    },
  )

  it("does not add an import-source restriction beyond the existing adapter", async () => {
    const capture = fixture()
    capture.source.submissions[0].import_metadata = { source: "old-source", normalized_name: "甲", legacy_profile: { interest_tags: ["旧格式兴趣"], match_history: [{ name: MEMBER_C, count: 2 }] } } as unknown as null
    mocks.submissions = capture.source.submissions
    mocks.history = capture.source.history_results
    const old = await buildRoundCandidates(ROUND)
    const prepared = prepareMatchingRunInput(capture)
    expect(prepared.candidates).toEqual(old.candidates)
    expect(prepared.candidates[0].interestTags).toContain("旧格式兴趣")
  })

  it.each([
    ["missing snapshot ID", (capture: ReturnType<typeof fixture>) => { capture.snapshot_id = "" }],
    ["invalid capture time", (capture: ReturnType<typeof fixture>) => { capture.captured_at = "tomorrow" }],
    ["different round", (capture: ReturnType<typeof fixture>) => { capture.source.submissions[0].round_id = id(91) }],
    ["duplicate registration", (capture: ReturnType<typeof fixture>) => { capture.source.submissions[1] = structuredClone(capture.source.submissions[0]) }],
    ["missing eligibility", (capture: ReturnType<typeof fixture>) => { capture.source.eligibility.pop() }],
    ["duplicate eligibility", (capture: ReturnType<typeof fixture>) => { capture.source.eligibility[1] = structuredClone(capture.source.eligibility[0]) }],
    ["unknown eligibility member", (capture: ReturnType<typeof fixture>) => { capture.source.eligibility[0].member_id = id(99) }],
    ["eligible with exclusion reason", (capture: ReturnType<typeof fixture>) => { capture.source.eligibility[0].reasons = ["cancelled"] }],
    ["ineligible without reason", (capture: ReturnType<typeof fixture>) => { capture.source.eligibility[0].eligible = false }],
    ["inconsistent readiness", (capture: ReturnType<typeof fixture>) => { capture.source.eligibility[0].readiness.quiz = false }],
    ["nonexempt incomplete readiness", (capture: ReturnType<typeof fixture>) => { capture.source.eligibility[0].readiness = { ...ready, quiz: false, missing: ["quiz"] } as typeof ready }],
    ["eligible missing member", (capture: ReturnType<typeof fixture>) => { capture.source.submissions[0].member = null as unknown as typeof capture.source.submissions[0]["member"] }],
    ["mismatched member", (capture: ReturnType<typeof fixture>) => { capture.source.submissions[0].member.id = id(99) }],
    ["nonarray interest tags", (capture: ReturnType<typeof fixture>) => { capture.source.submissions[0].interest_tags = "推理" as unknown as string[] }],
    ["invalid availability", (capture: ReturnType<typeof fixture>) => { capture.source.submissions[0].availability["2026-11-01"] = 1 as unknown as string[] }],
    ["invalid profile tags", (capture: ReturnType<typeof fixture>) => { capture.source.submissions[0].member.member_identity.hobby_tags = [null] as unknown as string[] }],
    ["nonfinite quiz score", (capture: ReturnType<typeof fixture>) => { capture.source.submissions[0].member.personality_quiz_results[0].score_e = NaN }],
    ["malformed history", (capture: ReturnType<typeof fixture>) => { capture.source.history_results[0].member_a_id = "not-a-uuid" }],
    ["invalid feedback", (capture: ReturnType<typeof fixture>) => { capture.source.feedbacks[0].overall_score = "5" as unknown as number }],
    ["invalid blacklist", (capture: ReturnType<typeof fixture>) => { capture.source.blacklist[0].status = "normal" }],
    ["invalid used import history", (capture: ReturnType<typeof fixture>) => { capture.source.submissions[0].import_metadata = { source: "legacy-temp", normalized_name: "甲", legacy_profile: { match_history: [{ name: MEMBER_B, count: "2" }] } } as unknown as null }],
  ])("fails closed on %s", (_, change) => {
    const capture = fixture()
    change(capture)
    expect(() => prepareMatchingRunInput(capture)).toThrow()
  })
})
