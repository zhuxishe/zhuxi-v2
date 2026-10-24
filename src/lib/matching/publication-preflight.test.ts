import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "./config"
import { pairKey, type PairRelation } from "./pair-history"
import { inspectPublicationPreflight, preparePublicationPreflightInput, type PublicationResultInput } from "./publication-preflight"
import type { MatchingEngineInput } from "./run-input"
import type { MatchCandidate } from "./types"

const scorers = vi.hoisted(() => ({ scorePair: vi.fn(() => { throw new Error("Publication must not rescore") }), scorePairFactors: vi.fn(() => { throw new Error("Publication must not rescore") }) }))
vi.mock("./scorer", () => scorers)

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const DATE = "2026-11-01"
function candidate(index: number, overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return { submissionId: id(index), name: `PRIVATE-PERSON-${index}`, gameTypePref: "都可以", genderPref: "都可以",
    availability: { [DATE]: ["下午", "晚上"] }, formInterestTags: [], formSocialStyle: null, gender: "女",
    school: null, interestTags: ["桌游"], socialTags: [], level: 0, compatibilityScore: null, matchHistory: [],
    gameMode: null, hasProfile: true, ...overrides }
}
function engine(members = [candidate(1), candidate(2)]): MatchingEngineInput {
  return { candidates: members, config: structuredClone(DEFAULT_CONFIG), idMap: members.map((member) => [member.submissionId, member.submissionId]),
    pairRelations: [], algorithm_version: "max_coverage_split:3", adapter_version: 2 }
}
function row(overrides: Partial<PublicationResultInput> = {}): PublicationResultInput {
  return { id: id(90), status: "draft", member_a_id: id(1), member_b_id: id(2), group_members: null,
    best_slot: `${DATE}_晚上`, ...overrides }
}
function relation(input: MatchingEngineInput, a: number, b: number, status: PairRelation["status"]) {
  input.pairRelations.push([pairKey(id(a), id(b)), { playerA: id(a), playerB: id(b), status, totalPairCount: 1,
    hasMutualFive: status === "cooldown" || status === "reunion", reason: "PRIVATE-RELATION-DETAIL" }])
}
function capture() {
  const members = [1, 2, 3]
  return {
    snapshot_id: id(900), captured_at: "2026-10-24T00:00:00Z",
    source: {
      algorithm_version: "max_coverage_split:3", adapter_version: 2,
      scoring_policy: { version: "INVALID-POLICY", dimensionWeights: null, activityFeedback: "irrelevant" },
      round: { id: id(99) }, questionnaire_refs: [], history_results: [], blacklist: [], feedbacks: [],
      submissions: members.map((member) => ({ id: id(100 + member), member_id: id(member), round_id: id(99),
        created_at: "2026-10-23T00:00:00Z", cancelled_at: null, game_type_pref: "都可以", gender_pref: "都可以",
        availability: { [DATE]: ["晚上"] }, interest_tags: [], member: { id: id(member),
          member_identity: { full_name: `PRIVATE-${member}`, gender: "female" } } })),
      eligibility: members.map((member) => ({ member_id: id(member), eligible: true, reasons: [] as string[], import_exempt: false,
        readiness: { supplementary: true, personality: true, quiz: true, missing: [] } })),
    },
  }
}

describe("publication final hard-constraint review", () => {
  it("keeps a valid saved duo exactly as it is, without reading or recalculating any score", () => {
    const saved = row()
    Object.defineProperty(saved, "total_score", { get() { throw new Error("Must not read existing score") } })
    Object.defineProperty(saved, "score_breakdown", { get() { throw new Error("Must not read scoring details") } })
    const input = engine(), before = structuredClone(input)
    expect(inspectPublicationPreflight(input, [saved])).toEqual({ passed: true, issues: [] })
    expect(saved.best_slot).toBe(`${DATE}_晚上`)
    expect(input).toEqual(before)
    expect(scorers.scorePair).not.toHaveBeenCalled()
    expect(scorers.scorePairFactors).not.toHaveBeenCalled()
  })

  it("accepts both historical slot formats but never silently chooses another common slot", () => {
    const input = engine()
    expect(inspectPublicationPreflight(input, [row({ best_slot: `${DATE} 下午` })]).passed).toBe(true)
    input.candidates[1].availability[DATE] = ["下午"]
    expect(inspectPublicationPreflight(input, [row()]).issues.map((issue) => issue.code)).toEqual(["original_time_unavailable"])
    expect(inspectPublicationPreflight(input, [row({ best_slot: null })]).passed).toBe(false)
    expect(inspectPublicationPreflight(input, [row({ best_slot: `${DATE}_上午` })]).passed).toBe(false)
  })

  it("refuses a formerly matched person who is no longer currently eligible", () => {
    const current = capture()
    current.source.eligibility[1] = { ...current.source.eligibility[1], eligible: false, reasons: ["cancelled"] }
    current.source.submissions[1].cancelled_at = "2026-10-24T00:00:00Z" as unknown as null
    const input = preparePublicationPreflightInput(current)
    expect(input.candidates.map((member) => member.submissionId)).toEqual([id(1), id(3)])
    expect(inspectPublicationPreflight(input, [row()])).toMatchObject({ passed: false, issues: [{ code: "member_unavailable" }] })
  })

  it("does not require canceled historical matches or unmatched members to qualify again", () => {
    const input = engine([candidate(1), candidate(2)])
    expect(inspectPublicationPreflight(input, [row(), row({ id: id(91), status: "cancelled", member_a_id: id(800), member_b_id: id(801) })]).passed).toBe(true)
    expect(inspectPublicationPreflight(input, [])).toEqual({ passed: true, issues: [] })
  })

  it.each(["blacklist", "cooldown"] as const)("honors unchanged existing %s hard veto for any pair in a pool", (status) => {
    const input = engine([candidate(1), candidate(2), candidate(3), candidate(4)])
    relation(input, 2, 3, status)
    const result = inspectPublicationPreflight(input, [row({ member_b_id: null, group_members: [id(1), id(2), id(3), id(4)] })])
    expect(result).toMatchObject({ passed: false, issues: [{ code: "hard_constraint" }] })
    expect(JSON.stringify(result)).not.toContain("PRIVATE")
  })

  it.each(["avoid", "reunion", "normal"] as const)("does not turn the %s soft history state into a new veto", (status) => {
    const input = engine()
    relation(input, 1, 2, status)
    expect(inspectPublicationPreflight(input, [row()]).passed).toBe(true)
  })

  it("rechecks changed gender preferences, while keeping the original unknown-gender rule", () => {
    const input = engine([candidate(1, { genderPref: "男" }), candidate(2)])
    expect(inspectPublicationPreflight(input, [row()]).issues[0].code).toBe("hard_constraint")
    input.candidates[1].gender = null
    expect(inspectPublicationPreflight(input, [row()]).passed).toBe(true)
  })

  it("rejects a new taboo conflict without exposing profile or conflict details", () => {
    const input = engine([candidate(1, { tabooTags: ["PRIVATE-TAG"] }), candidate(2, { interestTags: ["PRIVATE-TAG"] })])
    const result = inspectPublicationPreflight(input, [row()])
    expect(result.issues).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain("PRIVATE")
  })

  it("never publishes a multiplayer-only member as a duo, even with a flexible partner", () => {
    const input = engine([candidate(1, { gameTypePref: "多人" }), candidate(2)])
    expect(inspectPublicationPreflight(input, [row()]).issues[0].code).toBe("hard_constraint")
  })

  it("validates full pool gender compatibility and has no six-person cap or novice veto", () => {
    const input = engine(Array.from({ length: 8 }, (_, index) => candidate(index + 1,
      { gender: index === 7 ? "女" : "男", genderPref: index === 7 ? "男" : "女", acceptBeginners: false })))
    const saved = row({ member_b_id: null, group_members: input.candidates.map((member) => member.submissionId) })
    expect(inspectPublicationPreflight(input, [saved]).passed).toBe(true)
    input.candidates[7].gameTypePref = "双人"
    expect(inspectPublicationPreflight(input, [saved]).issues[0].code).toBe("hard_constraint")
  })

  it("rejects pairwise time overlaps that lack one shared pool time", () => {
    const input = engine([candidate(1, { availability: { [DATE]: ["上午", "下午"] } }),
      candidate(2, { availability: { [DATE]: ["下午", "晚上"] } }), candidate(3, { availability: { [DATE]: ["晚上", "上午"] } })])
    expect(inspectPublicationPreflight(input, [row({ member_b_id: null, group_members: [id(1), id(2), id(3)] })]).issues[0].code).toBe("original_time_unavailable")
  })

  it("refuses duplicate saved occupancy, repeated pool members, malformed pools, and a second pool", () => {
    const input = engine(Array.from({ length: 6 }, (_, index) => candidate(index + 1)))
    expect(inspectPublicationPreflight(input, [row(), row({ id: id(91) })]).issues[0].code).toBe("invalid_result")
    for (const group_members of [[id(1), id(2)], [id(1), id(2), id(2)], [id(2), id(3), id(4)]]) {
      expect(inspectPublicationPreflight(input, [row({ member_b_id: null, group_members })]).issues[0].code).toBe("invalid_result")
    }
    expect(inspectPublicationPreflight(input, [row({ member_b_id: null, group_members: [id(1), id(2), id(3)] }),
      row({ id: id(91), member_a_id: id(4), member_b_id: null, group_members: [id(4), id(5), id(6)] })]).issues[0].code).toBe("invalid_result")
  })

  it("rejects ambiguous candidate mappings and unsupported active statuses", () => {
    const input = engine()
    input.idMap[1][1] = id(1)
    expect(inspectPublicationPreflight(input, [row()]).issues[0].code).toBe("member_unavailable")
    expect(inspectPublicationPreflight(engine(), [row({ status: "confirmed" })]).issues[0].code).toBe("invalid_result")
    expect(inspectPublicationPreflight(engine(), [row({ status: "locked" })]).passed).toBe(true)
  })
})

describe("current publication capture adapter", () => {
  it("uses authoritative current hard inputs without requiring the latest scoring policy to be valid", () => {
    const current = capture(), before = structuredClone(current)
    expect(inspectPublicationPreflight(preparePublicationPreflightInput(current), [row()]).passed).toBe(true)
    expect(current).toEqual(before)
    expect(scorers.scorePair).not.toHaveBeenCalled()
    expect(scorers.scorePairFactors).not.toHaveBeenCalled()
  })

  it("preserves existing legacy history and blacklisting semantics instead of substituting activity reviews", () => {
    const current = capture()
    Object.assign(current.source, {
      history_results: [{ id: id(800), member_a_id: id(1), member_b_id: id(2), group_members: null }],
      feedbacks: [{ reviewer_id: id(1), reviewee_id: id(2), overall_score: 5 }, { reviewer_id: id(2), reviewee_id: id(1), overall_score: 5 }],
    })
    expect(inspectPublicationPreflight(preparePublicationPreflightInput(current), [row()]).issues[0].code).toBe("hard_constraint")
  })

  it("refuses unknown adapter generations and broken current qualification payloads", () => {
    const current = capture()
    current.source.adapter_version = 999
    expect(() => preparePublicationPreflightInput(current)).toThrow("VERSION_UNSUPPORTED")
    const broken = capture()
    broken.source.eligibility.pop()
    expect(() => preparePublicationPreflightInput(broken)).toThrow("eligibility membership")
  })
})
