import { describe, expect, it } from "vitest"
import { recommendSmallGroups } from "./board-small-groups"
import { checkGroupConstraints } from "./constraints"
import { pairKey } from "./pair-history"
import { createScoringV3Config } from "./scoring-policy"
import type { MatchingEngineInput } from "./run-input"
import type { MatchCandidate } from "./types"

function engine(count: number): MatchingEngineInput {
  const candidates: MatchCandidate[] = Array.from({ length: count }, (_, index) => ({
    submissionId: String(index + 1).padStart(3, "0"), name: `Person ${index + 1}`, gameTypePref: "多人", genderPref: "都可以",
    availability: { "2026-11-04": ["下午", "晚上"], "2026-11-05": ["上午"] }, formInterestTags: [], formSocialStyle: null,
    gender: "女", school: null, interestTags: [], socialTags: [], level: 1, compatibilityScore: 4, matchHistory: [], gameMode: null, hasProfile: true,
  }))
  return { candidates, idMap: candidates.map((person) => [person.submissionId, person.submissionId]), pairRelations: [], algorithm_version: "max_coverage_split:3", adapter_version: 2,
    config: createScoringV3Config({ version: "weighted_feedback:1", quizVersionId: "quiz", dimensionWeights: { E: .3, A: .3, O: .15, C: .1, N: .15 }, activityFeedback: [] }) }
}
const ids = (input: MatchingEngineInput) => input.candidates.map((person) => person.submissionId)

describe("bounded 4–6 person recommendations", () => {
  it.each([[0, []], [3, []], [4, [4]], [6, [6]], [7, [6]], [8, [4, 4]], [10, [5, 5]], [11, [6, 5]], [12, [6, 6]], [13, [5, 4, 4]]])("covers and balances %i candidates", (count, sizes) => {
    const input = engine(count as number)
    const output = recommendSmallGroups(input, ids(input))
    expect(output.map((group) => group.memberIds.length)).toEqual(sizes)
    expect(new Set(output.flatMap((group) => group.memberIds)).size).toBe(output.flatMap((group) => group.memberIds).length)
  })
  it("uses only supplied waiting members and keeps all common slots with the current pool time first", () => {
    const input = engine(12), selected = ids(input).slice(2, 10)
    const output = recommendSmallGroups(input, selected, "2026-11-04_晚上")
    expect(output.flatMap((group) => group.memberIds).sort()).toEqual(selected)
    for (const group of output) {
      expect(group.bestSlot).toBe("2026-11-04_晚上")
      expect(group.commonSlots).toEqual(["2026-11-04_晚上", "2026-11-04_下午", "2026-11-05_上午"])
    }
  })
  it("is deterministic when the same IDs, candidates, and source slot order are permuted", () => {
    const input = engine(10), before = structuredClone(input), first = recommendSmallGroups(input, ids(input))
    expect(input).toEqual(before)
    input.candidates.reverse(); input.idMap.reverse()
    input.candidates.forEach((person) => { person.availability = { "2026-11-05": ["上午"], "2026-11-04": ["晚上", "下午"] } })
    expect(recommendSmallGroups(input, ids(input))).toEqual(first)
  })
  it("requires one shared date and period across the entire group, not merely pairwise overlap", () => {
    const input = engine(4)
    input.candidates.forEach((person, index) => { person.availability = Object.fromEntries([0, 1, 2, 3].filter((day) => day !== index).map((day) => [`2026-11-0${day + 4}`, ["下午"]])) })
    expect(recommendSmallGroups(input, ids(input))).toEqual([])
  })
  it("finds groups at later times without a five-time-row display limit", () => {
    const input = engine(8)
    input.candidates.forEach((person, index) => { person.availability = index < 4 ? { "2026-11-04": ["上午", "下午", "晚上"], "2026-11-05": ["上午", "下午", "晚上"] } : { "2026-11-08": ["晚上"] } })
    const output = recommendSmallGroups(input, ids(input))
    expect(output.map((group) => group.memberIds.length)).toEqual([4, 4])
    expect(output.some((group) => group.bestSlot === "2026-11-08_晚上")).toBe(true)
  })
  it.each(["blacklist", "cooldown"] as const)("honors captured %s constraints", (status) => {
    const input = engine(8)
    input.pairRelations = [[pairKey("001", "002"), { playerA: "001", playerB: "002", status, totalPairCount: 1, hasMutualFive: false, reason: "PRIVATE" }]]
    const output = recommendSmallGroups(input, ids(input))
    expect(output.flatMap((group) => group.memberIds)).toHaveLength(8)
    expect(output.every((group) => !group.memberIds.includes("001") || !group.memberIds.includes("002"))).toBe(true)
    expect(JSON.stringify(output)).not.toContain("PRIVATE")
  })
  it("keeps gender preferences as whole-group constraints and leaves unplaceable people waiting", () => {
    const input = engine(8)
    input.candidates[7].gender = "男"
    input.candidates.slice(0, 7).forEach((person) => { person.genderPref = "男" })
    const output = recommendSmallGroups(input, ids(input))
    expect(output.map((group) => group.memberIds.length)).toEqual([6])
    expect(output[0].memberIds).toContain("008")
  })
  it("does not recommend a duo-only candidate or ignore taboo tags", () => {
    const input = engine(8)
    input.candidates[0].gameTypePref = "双人"
    input.candidates[1].tabooTags = ["forbidden"]
    input.candidates.slice(2).forEach((person) => { person.interestTags = ["forbidden"] })
    const output = recommendSmallGroups(input, ids(input))
    expect(output.flatMap((group) => group.memberIds)).not.toContain("001")
    expect(output.flatMap((group) => group.memberIds)).not.toContain("002")
    expect(output[0].memberIds).toHaveLength(6)
  })
  it("handles a larger mixed pool without unbounded combination enumeration", () => {
    const input = engine(60)
    input.candidates.forEach((person, index) => { person.gender = index < 30 ? "女" : "男"; person.genderPref = index < 30 ? "男" : "女" })
    const started = performance.now(), output = recommendSmallGroups(input, ids(input))
    expect(output.flatMap((group) => group.memberIds)).toHaveLength(60)
    expect(output.every((group) => {
      const members = group.memberIds.map((id) => input.candidates.find((person) => person.submissionId === id)!)
      return checkGroupConstraints(members[0], members.slice(1), input.config, new Map(input.pairRelations)).passed
    })).toBe(true)
    expect(performance.now() - started).toBeLessThan(3000)
  })
  it("covers 200 ordinary candidates and rejects oversized requests before allocating search structures", () => {
    const input = engine(200), started = performance.now()
    expect(recommendSmallGroups(input, ids(input)).flatMap((group) => group.memberIds)).toHaveLength(200)
    expect(performance.now() - started).toBeLessThan(3000)
    expect(() => recommendSmallGroups(input, Array.from({ length: 10000 }, (_, index) => `forged-${index}`))).toThrow("TOO_MANY")
  })
  it("does not let an impossible first candidate consume the search for everyone else", () => {
    const input = engine(60)
    input.candidates[0].genderPref = "男"
    const output = recommendSmallGroups(input, ids(input))
    expect(output.flatMap((group) => group.memberIds)).toHaveLength(59)
    expect(output.flatMap((group) => group.memberIds)).not.toContain("001")
  })
  it("can assign the most constrained member to a smaller group in a balanced size plan", () => {
    const input = engine(14)
    input.candidates.forEach((person, index) => { person.availability = index < 4 ? { "2026-11-04": ["下午"] } : { "2026-11-06": ["晚上"] } })
    const output = recommendSmallGroups(input, ids(input))
    expect(output.flatMap((group) => group.memberIds)).toHaveLength(14)
    expect(output.map((group) => group.memberIds.length).sort()).toEqual([4, 5, 5])
  })
  it("maps submission identities back to actual member identities", () => {
    const input = engine(4)
    input.idMap = input.idMap.map(([submission]) => [submission, `member-${submission}`])
    expect(recommendSmallGroups(input, input.idMap.map(([, member]) => member))[0].memberIds).toEqual(["member-001", "member-002", "member-003", "member-004"])
  })
  it("fails closed on missing candidates and malformed availability", () => {
    const input = engine(4)
    expect(() => recommendSmallGroups(input, ["outside", ...ids(input)])).toThrow("INELIGIBLE")
    input.candidates[0].availability = { "2026-11-04": ["invalid"] }
    expect(() => recommendSmallGroups(input, ids(input))).toThrow("TIME_INVALID")
  })
})
