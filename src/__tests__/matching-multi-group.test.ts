import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "@/lib/matching/config"
import { findGroupBestSlot } from "@/lib/matching/match-utils"
import { runMaxCoverageMultiMatching } from "@/lib/matching/multi-group"
import type { MatchCandidate } from "@/lib/matching/types"

function buildCandidate(name: string, availability: MatchCandidate["availability"]): MatchCandidate {
  return {
    submissionId: name,
    name,
    gameTypePref: "多人",
    genderPref: "都可以",
    availability,
    formInterestTags: [],
    formSocialStyle: null,
    gender: null,
    school: null,
    interestTags: [],
    socialTags: [],
    level: 0,
    compatibilityScore: null,
    matchHistory: [],
    gameMode: null,
    hasProfile: false,
  }
}

describe("multi-group strict common slot", () => {
  it("does not form a group when only pairwise overlap exists", () => {
    const candidates = [
      buildCandidate("A", { "2026-04-21": ["上午", "下午"] }),
      buildCandidate("B", { "2026-04-21": ["上午", "晚上"] }),
      buildCandidate("C", { "2026-04-21": ["下午", "晚上"] }),
    ]

    const result = runMaxCoverageMultiMatching(candidates, DEFAULT_CONFIG, 6)

    expect(findGroupBestSlot(candidates)).toBeNull()
    expect(result.groups).toHaveLength(0)
    expect(result.unmatched).toHaveLength(3)
  })
})
