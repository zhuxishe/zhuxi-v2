import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "./config"
import { findCoveragePlan, maximumCardinalityPairs } from "./coverage-plan"
import { pairKey, type PairRelation } from "./pair-history"
import { runFullMatching } from "./run-matching"
import type { MatchCandidate } from "./types"

function graph(n: number, edges: [number, number][]): number[][] {
  const rows = Array.from({ length: n }, () => [] as number[])
  for (const [a, b] of edges) { rows[a].push(b); rows[b].push(a) }
  return rows
}
function oracleCardinality(adjacency: number[][]): number {
  const memo = new Map<number, number>()
  const visit = (mask: number): number => {
    if (!mask) return 0
    const cached = memo.get(mask)
    if (cached !== undefined) return cached
    const low = mask & -mask, i = 31 - Math.clz32(low), rest = mask ^ low
    let best = visit(rest)
    for (const j of adjacency[i]) if (rest & (1 << j)) best = Math.max(best, 1 + visit(rest ^ (1 << j)))
    memo.set(mask, best); return best
  }
  return visit((1 << adjacency.length) - 1)
}
function expectMatching(adjacency: number[][]) {
  const pairs = maximumCardinalityPairs(adjacency)
  expect(pairs).toHaveLength(oracleCardinality(adjacency))
  const members = pairs.flat()
  expect(new Set(members).size).toBe(members.length)
  for (const [a, b] of pairs) expect(adjacency[a]).toContain(b)
  expect(maximumCardinalityPairs(adjacency)).toEqual(pairs)
}
function candidate(i: number, gameTypePref: MatchCandidate["gameTypePref"] = "都可以"): MatchCandidate {
  return { submissionId: `person-${i}`, name: `person-${i}`, gameTypePref, genderPref: "都可以",
    availability: { "2026-01-01": ["晚上"] }, formInterestTags: [], formSocialStyle: null,
    gender: i % 2 ? "女" : "男", school: null, interestTags: ["推理"], socialTags: [], level: 0,
    compatibilityScore: null, matchHistory: [], gameMode: null, hasProfile: true }
}

describe("general graph cardinality matching", () => {
  it("handles empty graphs and isolated members", () => {
    expect(maximumCardinalityPairs([])).toEqual([])
    expectMatching(graph(8, [[0, 1], [2, 3]]))
  })
  it("handles odd flowers with externally connected stems", () => {
    expectMatching(graph(12, [[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 5], [5, 3], [5, 6], [6, 7], [7, 8], [8, 6], [8, 9], [9, 10], [10, 11]]))
    expectMatching(graph(10, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [0, 5], [1, 6], [2, 7], [3, 8], [4, 9]]))
  })
  it("handles augmenting paths longer than the old two-level repair", () => {
    expectMatching(graph(16, Array.from({ length: 15 }, (_, i) => [i, i + 1] as [number, number])))
  })
  for (let seed = 1; seed <= 160; seed++) it(`agrees with an independent bitmask oracle on seeded graph ${seed}`, () => {
    let value = seed
    const random = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296 }
    const n = 3 + seed % 12, edges: [number, number][] = []
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (random() < (seed % 7 + 1) / 9) edges.push([i, j])
    const adjacency = graph(n, edges)
    // Also exercise a different adjacency traversal order without changing edges.
    expectMatching(adjacency)
    expectMatching(adjacency.map((row) => [...row].reverse()))
  })
})

describe("large pool bounded matching", () => {
  it("leaves an impossible gender preference unmatched while covering the other 19", () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({ ...candidate(i, "多人"), gender: "男" }))
    candidates[0].genderPref = "女"
    const plan = findCoveragePlan(candidates, DEFAULT_CONFIG)
    expect(plan.multi).toEqual(Array.from({ length: 19 }, (_, i) => i + 1))
    expect(plan.objective.covered).toBe(19)
  })
  it("preserves unknown-gender support when pruning larger pools", () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({ ...candidate(i, "多人"), gender: "男" } as MatchCandidate))
    candidates[0].genderPref = "女"
    candidates[19].gender = null
    expect(findCoveragePlan(candidates, DEFAULT_CONFIG).objective.covered).toBe(20)
  })
  it("retains preferences that need a third pool member rather than a compatible two-person prefix", () => {
    const candidates = Array.from({ length: 20 }, (_, i) => candidate(i, "多人"))
    candidates[0].gender = "男"; candidates[0].genderPref = "女"
    candidates[1].gender = "女"; candidates[1].genderPref = "女"
    candidates[2].gender = "女"; candidates[2].genderPref = "男"
    expect(findCoveragePlan(candidates, DEFAULT_CONFIG).objective.covered).toBe(20)
  })
  it("evaluates later time slots before one conflicting early slot consumes the plan budget", () => {
    const candidates = Array.from({ length: 199 }, (_, i) => ({ ...candidate(i, "多人"),
      availability: { [i < 100 ? "2026-01-01" : "2026-01-02"]: ["晚上"] } }))
    const relations = new Map<string, PairRelation>()
    // The first time slot has more applicants, but its twelve mutually
    // conflicting seeds permit only 89. The later slot can cover all 99.
    for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) relations.set(pairKey(`person-${i}`, `person-${j}`), {
      playerA: `person-${i}`, playerB: `person-${j}`, status: "blacklist", totalPairCount: 0, hasMutualFive: false, reason: "test",
    })
    const plan = findCoveragePlan(candidates, DEFAULT_CONFIG, relations)
    expect(plan.objective.covered).toBe(99)
    expect(plan.multiBestSlot).toBe("2026-01-02_晚上")
  })
  it("puts 25 compatible multiplayer applicants into exactly one pool", () => {
    const candidates = Array.from({ length: 25 }, (_, i) => candidate(i, "多人"))
    const result = runFullMatching(candidates, DEFAULT_CONFIG, new Map())
    expect(result.totalMatched).toBe(25)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].group_members).toHaveLength(25)
    expect(result.rows[0].total_score).toBeGreaterThan(0)
    expect(result.rows[0].best_slot).toBe("2026-01-01_晚上") // Past dates remain untouched.
  })
  it("reserves an either applicant when that covers a duo-only applicant too", () => {
    const candidates = [candidate(0, "双人"), ...Array.from({ length: 19 }, (_, i) => candidate(i + 1, "多人")), candidate(20)]
    const plan = findCoveragePlan(candidates, DEFAULT_CONFIG)
    expect(plan.exact).toBe(false)
    expect(plan.objective.covered).toBe(21)
    expect(plan.duos).toHaveLength(1)
    expect(plan.multi).toHaveLength(19)
  })
  it("never violates hard conflicts, repeats deterministic results, or mutates saved inputs", () => {
    const candidates = Array.from({ length: 24 }, (_, i) => candidate(i, i % 3 === 0 ? "双人" : i % 3 === 1 ? "多人" : "都可以"))
    const relations = new Map<string, PairRelation>()
    for (let i = 0; i < 24; i++) for (let j = i + 1; j < 24; j++) if ((i + j) % 7 === 0) relations.set(pairKey(`person-${i}`, `person-${j}`), {
      playerA: `person-${i}`, playerB: `person-${j}`, status: "blacklist", totalPairCount: 0, hasMutualFive: false, reason: "test",
    })
    const before = structuredClone(candidates)
    const plan = findCoveragePlan(candidates, DEFAULT_CONFIG, relations)
    expect(findCoveragePlan(candidates, DEFAULT_CONFIG, relations)).toEqual(plan)
    expect(candidates).toEqual(before)
    for (const [i, j] of plan.duos.map((pair) => [pair.i, pair.j])) expect(relations.get(pairKey(`person-${i}`, `person-${j}`))?.status).not.toBe("blacklist")
    for (const i of plan.multi) for (const j of plan.multi) if (i !== j) expect(relations.get(pairKey(`person-${i}`, `person-${j}`))?.status).not.toBe("blacklist")
  })
})
