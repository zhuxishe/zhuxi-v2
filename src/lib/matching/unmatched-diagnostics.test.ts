import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "./config"
import { buildUnmatchedDiagnostics } from "./unmatched-diagnostics"
import { unmatchedDiagnosticMessages } from "./unmatched-diagnostic-display"
import { pairKey, type PairRelation } from "./pair-history"
import type { MatchCandidate } from "./types"

function candidate(id: string, overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return { submissionId: id, name: `private-name-${id}`, gameTypePref: "双人", genderPref: "都可以",
    availability: { "2026-10-27": ["晚上"] }, formInterestTags: [], formSocialStyle: null,
    gender: "女", school: null, interestTags: [], socialTags: [], level: 0,
    compatibilityScore: null, matchHistory: [], gameMode: null, hasProfile: true, ...overrides }
}
function engine(candidates: MatchCandidate[], pairRelations: [string, PairRelation][] = []) {
  return { candidates, config: structuredClone(DEFAULT_CONFIG),
    idMap: candidates.map((row) => [row.submissionId, `member-${row.submissionId}`] as [string, string]), pairRelations }
}
function relation(a: string, b: string, status: PairRelation["status"]): [string, PairRelation] {
  return [pairKey(a, b), { playerA: a, playerB: b, status, reason: "private-blacklist-reason",
    totalPairCount: 3, hasMutualFive: status === "cooldown" }]
}

describe("frozen full-cohort unmatched diagnostics", () => {
  it("counts already assigned candidates rather than inferring from only the unmatched subset", () => {
    const input = engine([candidate("A"), candidate("B"), candidate("C")])
    const before = structuredClone(input)
    const [diagnostic] = buildUnmatchedDiagnostics(input, ["A"])
    expect(diagnostic).toEqual({ member_id: "member-A", reason: "not_selected", details: {
      version: "matching_diagnostic:1", code: "not_selected", cohort_size: 3,
      shared_time_peer_count: 2, feasible_duo_count: 2, multi_max_shared_peer_count: 0, search_mode: "exhaustive",
    } })
    expect(unmatchedDiagnosticMessages(diagnostic.details)[0]).toContain("不能据此认定无法匹配")
    expect(input).toEqual(before)
  })

  it("establishes absence of shared time using the original complete cohort", () => {
    const input = engine([candidate("A"), candidate("B", { availability: { "2026-10-28": ["晚上"] } })])
    const [diagnostic] = buildUnmatchedDiagnostics(input, ["A"])
    expect(diagnostic.reason).toBe("no_common_time")
    expect(diagnostic.details.shared_time_peer_count).toBe(0)
    expect(unmatchedDiagnosticMessages(diagnostic.details)[0]).toContain("没有共同可用时段")
  })

  it("can prove a duo-only applicant has no feasible combination despite shared time", () => {
    const input = engine([candidate("A", { genderPref: "男" }), candidate("B")])
    const [diagnostic] = buildUnmatchedDiagnostics(input, ["A"])
    expect(diagnostic.reason).toBe("no_feasible_combination")
    expect(diagnostic.details).toMatchObject({ shared_time_peer_count: 1, feasible_duo_count: 0 })
  })

  it("includes 都可以 and never applies mutual duo gender checks to potential whole-pool members", () => {
    const input = engine([
      candidate("A", { gameTypePref: "多人", genderPref: "男" }),
      candidate("B", { gameTypePref: "都可以", genderPref: "男" }),
      candidate("C", { gameTypePref: "多人", gender: "男" }),
      candidate("D", { gameTypePref: "双人" }),
    ])
    const [diagnostic] = buildUnmatchedDiagnostics(input, ["A"])
    expect(diagnostic.reason).toBe("not_selected")
    expect(diagnostic.details).toMatchObject({ feasible_duo_count: 0, multi_max_shared_peer_count: 2 })
  })

  it("uses the common-slot upper bound rather than total overlapping peers", () => {
    const input = engine([
      candidate("A", { gameTypePref: "多人", availability: { "2026-10-27": ["下午", "晚上"] } }),
      candidate("B", { gameTypePref: "多人", availability: { "2026-10-27": ["下午"] } }),
      candidate("C", { gameTypePref: "多人" }),
    ])
    const [diagnostic] = buildUnmatchedDiagnostics(input, ["A"])
    expect(diagnostic.reason).toBe("no_feasible_combination")
    expect(diagnostic.details).toMatchObject({ shared_time_peer_count: 2, multi_max_shared_peer_count: 1 })
  })

  it("does not claim a feasible pool exists when the candidate's potential peers conflict with each other", () => {
    const input = engine(["A", "B", "C"].map((id) => candidate(id, { gameTypePref: "多人" })), [relation("B", "C", "blacklist")])
    const [diagnostic] = buildUnmatchedDiagnostics(input, ["A"])
    expect(diagnostic.reason).toBe("not_selected")
    expect(diagnostic.details.multi_max_shared_peer_count).toBe(2)
  })

  it.each(["blacklist", "cooldown"] as const)("counts hard relation vetoes but never exposes %s reasons", (status) => {
    const input = engine([candidate("A"), candidate("B")], [relation("A", "B", status)])
    const [diagnostic] = buildUnmatchedDiagnostics(input, ["A"])
    expect(diagnostic.reason).toBe("no_feasible_combination")
    expect(JSON.stringify(diagnostic)).not.toContain("private-")
    expect(JSON.stringify(diagnostic)).not.toContain(status)
    expect(Object.keys(diagnostic.details)).toHaveLength(7)
  })

  it("does not call an ordinary repeated pair or zero-scoring feasible pair impossible", () => {
    const input = engine([candidate("A"), candidate("B")], [relation("A", "B", "avoid")])
    input.config.weights = Object.fromEntries(Object.keys(input.config.weights).map((key) => [key, 0])) as typeof input.config.weights
    expect(buildUnmatchedDiagnostics(input, ["A"])[0]).toMatchObject({ reason: "not_selected", details: { feasible_duo_count: 1 } })
  })

  it.each([18, 19])("makes search certainty explicit for a %i-person frozen cohort", (size) => {
    const input = engine(Array.from({ length: size }, (_, index) => candidate(String(index))))
    const [diagnostic] = buildUnmatchedDiagnostics(input, ["0"])
    expect(diagnostic.details.search_mode).toBe(size === 18 ? "exhaustive" : "bounded")
    expect(unmatchedDiagnosticMessages(diagnostic.details).some((text) => text.includes("限额搜索"))).toBe(size === 19)
  })

  it("ignores IDs outside the frozen cohort and does not duplicate repeated IDs", () => {
    expect(buildUnmatchedDiagnostics(engine([candidate("A"), candidate("B")]), ["unknown", "A", "A"])).toHaveLength(1)
  })

  it.each([null, { reason: "当前资料推测" }, { version: "matching_diagnostic:2" }, {
    version: "matching_diagnostic:1", code: "no_common_time", cohort_size: 3,
    shared_time_peer_count: 2, feasible_duo_count: 0, multi_max_shared_peer_count: 0, search_mode: "exhaustive",
  }])("does not infer a reason for legacy or invalid saved details: %j", (details) => {
    expect(unmatchedDiagnosticMessages(details)).toEqual(["历史记录未保存详细原因，无法据此确定未匹配原因"])
  })
})
