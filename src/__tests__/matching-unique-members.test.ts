import { describe, expect, it } from "vitest"
import { augmentPaths } from "@/lib/matching/augment-path"
import { runFullMatching } from "@/lib/matching/run-matching"
import { DEFAULT_CONFIG } from "@/lib/matching/config"
import type { FeasiblePair } from "@/lib/matching/match-utils"
import type { MatchCandidate } from "@/lib/matching/types"

function edge(i: number, j: number): FeasiblePair {
  return {
    i, j, bestSlot: "2026-10-10_下午", bonus: 0, isRepeat: false,
    score: { userA: String(i), userB: String(j), totalScore: 60, breakdown: [], hardVeto: false, vetoReasons: [], explanationZh: "" },
  }
}

describe("matching member uniqueness", () => {
  it.each([
    { n: 4, original: [edge(1, 2)], feasible: [edge(0, 1), edge(1, 2), edge(2, 3)] },
    { n: 6, original: [edge(1, 2), edge(3, 4)], feasible: [edge(0, 1), edge(1, 2), edge(2, 3), edge(3, 4), edge(4, 5)] },
  ])("keeps all original members occupied when rescuing a $n-person path", ({ n, original, feasible }) => {
    const result = [...original]
    const matched = new Set(result.flatMap(({ i, j }) => [i, j]))
    augmentPaths(n, feasible, matched, result)
    const assigned = result.flatMap(({ i, j }) => [i, j])
    expect(assigned).toHaveLength(n)
    expect(new Set(assigned).size).toBe(n)
    expect(matched).toEqual(new Set(assigned))
  })

  it("does not produce eight pair slots from the seven-member regression fixture", () => {
    const ids = "ABCDEFG".split("")
    const candidates: MatchCandidate[] = ids.map((id) => ({
      submissionId: id, name: id, gameTypePref: "双人", genderPref: "都可以", availability: {},
      formInterestTags: [], formSocialStyle: null, gender: "男", school: "测试大学", interestTags: [],
      socialTags: [], level: 1, compatibilityScore: 4, matchHistory: [], gameMode: "双人本", hasProfile: true,
    }))
    // Each edge is a shared time slot; these valid preferences previously assigned A twice.
    const edges = [[0, 1], [0, 2], [0, 3], [0, 6], [1, 3], [2, 4], [2, 5], [2, 6], [4, 5]]
    edges.forEach(([i, j], index) => {
      const date = `2026-10-${String(index + 1).padStart(2, "0")}`
      candidates[i].availability[date] = ["下午"]
      candidates[j].availability[date] = ["下午"]
    })
    const result = runFullMatching(candidates, DEFAULT_CONFIG, new Map(ids.map((id) => [id, id])))
    const assigned = result.rows.flatMap((row) => [row.member_a_id, row.member_b_id])
    expect(result.rows).toHaveLength(3)
    expect(new Set(assigned).size).toBe(6)
    expect(result.totalMatched).toBe(6)
    expect(result.totalUnmatched).toBe(1)
    expect(assigned).not.toContain(result.unmatchedIds[0])
  })
})
