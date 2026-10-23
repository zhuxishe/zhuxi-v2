import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "./config"
import { checkGroupConstraints } from "./constraints"
import { findGroupBestSlot } from "./match-utils"
import { pairKey, type PairRelation, type PairStatus } from "./pair-history"
import { runFullMatching } from "./run-matching"
import { scorePair, scorePairFactors } from "./scorer"
import type { MatchCandidate, MatchingConfig } from "./types"

const date = "2030-11-03"
const slots = ["上午", "下午", "晚上"]

function candidate(id: string, changes: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    submissionId: id, name: id, gameTypePref: "都可以", genderPref: "都可以",
    availability: { [date]: slots }, formInterestTags: [], formSocialStyle: null,
    gender: null, school: null, interestTags: ["推理"], socialTags: [], level: 0,
    compatibilityScore: null, matchHistory: [], gameMode: null, hasProfile: false,
    ...changes,
  }
}

function relationship(a: string, b: string, status: PairStatus): [string, PairRelation] {
  return [pairKey(a, b), { playerA: a, playerB: b, status, totalPairCount: 1,
    hasMutualFive: status === "cooldown" || status === "reunion", reason: status }]
}

interface OracleObjective { covered: number; repeats: number; quality: number; poolSize: number }

function repeatCount(a: MatchCandidate, b: MatchCandidate, relations: Map<string, PairRelation>) {
  return Number(relations.get(pairKey(a.submissionId, b.submissionId))?.status === "avoid")
}

function duoScore(a: MatchCandidate, b: MatchCandidate, config: MatchingConfig, relations: Map<string, PairRelation>) {
  const status = relations.get(pairKey(a.submissionId, b.submissionId))?.status
  return scorePair(a, b, config, relations).totalScore + (status === "reunion" ? 30 : status === "avoid" ? -20 : 0)
}

function poolScore(members: MatchCandidate[], config: MatchingConfig) {
  let total = 0
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) total += scorePairFactors(members[i], members[j], config).totalScore
  }
  return total / (members.length * (members.length - 1) / 2)
}

/** Enumerate every pool subset and every remaining disjoint pair assignment, including abstentions. */
function exhaustiveCoverage(candidates: MatchCandidate[], config: MatchingConfig, relations: Map<string, PairRelation>) {
  if (candidates.length > 8) throw new Error("The independent exhaustive oracle is limited to eight candidates")
  const legalDuo = candidates.map((a, i) => candidates.map((b, j) => i !== j
    && a.gameTypePref !== "多人" && b.gameTypePref !== "多人"
    && !scorePair(a, b, config, relations).hardVeto))
  let best: OracleObjective = { covered: 0, repeats: 0, quality: 0, poolSize: 0 }
  const enumeratePairs = (remaining: number[], objective: OracleObjective) => {
    if (remaining.length === 0) {
      const alternatives = [objective.covered - best.covered, best.repeats - objective.repeats,
        Math.abs(objective.quality - best.quality) < 1e-9 ? 0 : objective.quality - best.quality,
        objective.poolSize - best.poolSize]
      if ((alternatives.find((difference) => difference !== 0) ?? 0) > 0) best = objective
      return
    }
    const [first, ...others] = remaining
    enumeratePairs(others, objective)
    for (const partner of others) {
      if (legalDuo[first][partner]) enumeratePairs(others.filter((index) => index !== partner), {
        ...objective, covered: objective.covered + 2,
        repeats: objective.repeats + repeatCount(candidates[first], candidates[partner], relations),
        quality: objective.quality + duoScore(candidates[first], candidates[partner], config, relations) * 2,
      })
    }
  }
  const indices = candidates.map((_, index) => index)
  enumeratePairs(indices, { covered: 0, repeats: 0, quality: 0, poolSize: 0 })
  for (let selection = 0; selection < 2 ** candidates.length; selection++) {
    const selected = indices.filter((index) => (selection & (1 << index)) !== 0)
    if (selected.length < 3) continue
    const pool = selected.map((index) => candidates[index])
    if (!findGroupBestSlot(pool) || !checkGroupConstraints(pool[0], pool.slice(1), config, relations).passed) continue
    let repeats = 0
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) repeats += repeatCount(pool[i], pool[j], relations)
    }
    enumeratePairs(indices.filter((index) => !selected.includes(index)), {
      covered: selected.length, repeats, quality: poolScore(pool, config) * pool.length, poolSize: pool.length,
    })
  }
  return best
}

function assertOptimalAndLegal(candidates: MatchCandidate[], relations = new Map<string, PairRelation>(), config = DEFAULT_CONFIG,
  options?: { oracleCandidates: MatchCandidate[]; coverageOnly: boolean }) {
  const expected = exhaustiveCoverage(options?.oracleCandidates ?? candidates, config, relations)
  const result = runFullMatching(candidates, config, new Map(candidates.map((row) => [row.submissionId, row.submissionId])), relations)
  const byId = new Map(candidates.map((row) => [row.submissionId, row]))
  const coveredIds: string[] = []
  let pools = 0
  let repeats = 0, quality = 0, poolSize = 0
  for (const row of result.rows) {
    const ids = row.group_members?.length ? row.group_members : [row.member_a_id, row.member_b_id!]
    expect(ids.every((id) => byId.has(id))).toBe(true)
    const members = ids.map((id) => byId.get(id)!)
    if (row.group_members?.length) {
      pools++
      expect(members.length).toBeGreaterThanOrEqual(3)
      expect(checkGroupConstraints(members[0], members.slice(1), config, relations).passed).toBe(true)
      expect(row.best_slot).toBe(findGroupBestSlot(members))
      poolSize = members.length
      const average = poolScore(members, config)
      expect(row.total_score).toBe(Math.round(average * 10) / 10)
      quality += average * members.length
    } else {
      expect(members).toHaveLength(2)
      expect(members.every((member) => member.gameTypePref !== "多人")).toBe(true)
      expect(scorePair(members[0], members[1], config, relations).hardVeto).toBe(false)
      expect(row.total_score).toBe(duoScore(members[0], members[1], config, relations))
      quality += row.total_score * 2
      expect(row.best_slot).toBeTruthy()
      const [day, slot] = row.best_slot!.split("_")
      expect(members.every((member) => member.availability[day]?.includes(slot) || member.availability[day]?.includes("全天"))).toBe(true)
    }
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) repeats += repeatCount(members[i], members[j], relations)
    }
    expect(Number.isFinite(row.total_score)).toBe(true)
    coveredIds.push(...ids)
  }
  expect(pools).toBeLessThanOrEqual(1)
  expect(new Set(coveredIds).size).toBe(coveredIds.length)
  expect(result.totalMatched).toBe(expected.covered)
  if (!options?.coverageOnly) {
    expect(repeats).toBe(expected.repeats)
    expect(quality).toBeCloseTo(expected.quality, 7)
    expect(poolSize).toBe(expected.poolSize)
  }
  expect(result.totalMatched).toBe(coveredIds.length)
  expect(result.totalCandidates).toBe(candidates.length)
  expect(result.totalUnmatched).toBe(candidates.length - coveredIds.length)
  expect([...coveredIds, ...result.unmatchedIds].sort()).toEqual(candidates.map((row) => row.submissionId).sort())
  expect(result.unmatchedIds).toHaveLength(result.totalUnmatched)
  return result
}

function scenario(seed: number, count: number) {
  let state = seed
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
  const candidates = Array.from({ length: count }, (_, index) => candidate(`member-${index}`, {
    gameTypePref: (["双人", "多人", "都可以"] as const)[Math.floor(random() * 3)],
    gender: (["男", "女", null] as const)[Math.floor(random() * 3)],
    genderPref: (["都可以", "都可以", "男", "女"] as const)[Math.floor(random() * 4)],
    availability: { [date]: slots.filter(() => random() > 0.25) },
    interestTags: random() < 0.5 ? ["推理"] : ["竞技"],
    tabooTags: random() < 0.15 ? ["竞技"] : [],
    level: Math.floor(random() * 4), acceptBeginners: random() > 0.5,
  }))
  const relations = new Map<string, PairRelation>()
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const draw = random()
      if (draw < 0.25) {
        const status: PairStatus = draw < 0.05 ? "blacklist" : draw < 0.1 ? "cooldown" : draw < 0.2 ? "avoid" : "reunion"
        const [key, value] = relationship(candidates[i].submissionId, candidates[j].submissionId, status)
        relations.set(key, value)
      }
    }
  }
  return { candidates, relations }
}

function forceLargePath(candidates: MatchCandidate[]) {
  return [...candidates, ...Array.from({ length: 19 - candidates.length }, (_, index) => candidate(`isolated-${index}`, {
    gameTypePref: "双人", availability: {},
  }))]
}

describe("full matching against an independent exhaustive coverage oracle", () => {
  it.each([
    ["three flexible members", ["都可以", "都可以", "都可以"]],
    ["two multi plus two flexible", ["多人", "多人", "都可以", "都可以"]],
    ["one duo plus three multi and one flexible", ["双人", "多人", "多人", "多人", "都可以"]],
    ["two of each preference", ["双人", "双人", "多人", "多人", "都可以", "都可以"]],
    ["seven multi members", Array(7).fill("多人")],
    ["eight multi members", Array(8).fill("多人")],
  ])("maximizes coverage for %s", (_name, preferences) => {
    const result = assertOptimalAndLegal(preferences.map((gameTypePref, index) => candidate(`member-${index}`, { gameTypePref })))
    if (preferences.every((preference) => preference === "多人")) {
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].total_score).toBeGreaterThan(0)
    }
  })

  it("keeps a feasible three-way gender group even when its pairs cannot seed the pool", () => {
    const candidates = [
      candidate("A", { gameTypePref: "多人", gender: "男", genderPref: "女" }),
      candidate("B", { gameTypePref: "多人", gender: "女", genderPref: "女" }),
      candidate("C", { gameTypePref: "多人", gender: "女", genderPref: "男" }),
    ]
    expect(assertOptimalAndLegal(candidates).totalMatched).toBe(3)
  })

  it("rearranges a fresh pair when ordinary repeats can cover two additional people", () => {
    const candidates = ["A", "B", "C", "D"].map((id) => candidate(id, { gameTypePref: "双人" }))
    const relations = new Map([
      relationship("A", "C", "avoid"), relationship("B", "D", "avoid"),
      relationship("A", "D", "blacklist"), relationship("B", "C", "blacklist"), relationship("C", "D", "blacklist"),
    ])
    expect(assertOptimalAndLegal(candidates, relations).totalMatched).toBe(4)
  })

  it("keeps a beginner eligible even when the other member's historical answer rejects beginners", () => {
    const candidates = [
      candidate("experienced", { gameTypePref: "双人", level: 3, acceptBeginners: false }),
      candidate("beginner", { gameTypePref: "双人", level: 0 }),
    ]
    expect(assertOptimalAndLegal(candidates).totalMatched).toBe(2)
  })

  it("allows only one complete pool rather than combining disjoint meeting times", () => {
    const candidates = Array.from({ length: 6 }, (_, index) => candidate(`member-${index}`, {
      gameTypePref: "多人", availability: { [date]: [index < 3 ? "上午" : "晚上"] },
    }))
    expect(assertOptimalAndLegal(candidates).totalMatched).toBe(3)
  })

  it.each(Array.from({ length: 60 }, (_, index) => ({ seed: 1001 + index, count: 3 + index % 6 })))
    ("finds a legal maximum for seeded $seed with $count candidates", ({ seed, count }) => {
      const { candidates, relations } = scenario(seed, count)
      assertOptimalAndLegal(candidates, relations)
      assertOptimalAndLegal([...candidates].reverse(), relations)
    })

  it("matches the oracle with gender enforcement disabled", () => {
    const { candidates, relations } = scenario(1027, 8)
    assertOptimalAndLegal(candidates, relations, { ...DEFAULT_CONFIG, hardConstraints: { enforceGender: false } })
  })
})

describe("bounded matching against independently solvable padded cohorts", () => {
  it.each(Array.from({ length: 60 }, (_, index) => ({ seed: 1001 + index, count: 3 + index % 6 })))
    ("preserves achievable coverage in large-path seed $seed", ({ seed, count }) => {
      const { candidates, relations } = scenario(seed, count)
      const padded = forceLargePath(candidates)
      const options = { oracleCandidates: candidates, coverageOnly: true }
      assertOptimalAndLegal(padded, relations, DEFAULT_CONFIG, options)
      assertOptimalAndLegal([...padded].reverse(), relations, DEFAULT_CONFIG, options)
    })

  it("excludes an unsatisfiable gender-dependent member without abandoning the remaining legal pool", () => {
    const candidates = Array.from({ length: 8 }, (_, index) => candidate(`member-${index}`, {
      gameTypePref: "多人", gender: "男", genderPref: index === 0 ? "女" : "都可以",
    }))
    const options = { oracleCandidates: candidates, coverageOnly: true }
    expect(assertOptimalAndLegal(forceLargePath(candidates), new Map(), DEFAULT_CONFIG, options).totalMatched).toBe(7)
    expect(assertOptimalAndLegal(forceLargePath([...candidates].reverse()), new Map(), DEFAULT_CONFIG, options).totalMatched).toBe(7)
  })

  it.each(["cyclic gender dependencies", "unknown gender satisfies an existing preference"])("keeps %s viable on the large path", (mode) => {
    const candidates = [
      candidate("A", { gameTypePref: "多人", gender: "男", genderPref: "女" }),
      candidate("B", { gameTypePref: "多人", gender: mode.startsWith("unknown") ? null : "女", genderPref: "女" }),
      candidate("C", { gameTypePref: "多人", gender: "女", genderPref: "男" }),
    ]
    expect(assertOptimalAndLegal(forceLargePath(candidates), new Map(), DEFAULT_CONFIG,
      { oracleCandidates: candidates, coverageOnly: true }).totalMatched).toBe(3)
  })
})
