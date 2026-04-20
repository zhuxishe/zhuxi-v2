import { describe, expect, it } from "vitest"
import { submissionToCandidate } from "@/lib/matching/adapter-submission"
import { mergeMatchHistory } from "@/lib/matching/round-import-utils"

describe("submissionToCandidate import metadata", () => {
  it("uses imported legacy fields when member profile data is missing", () => {
    const candidate = submissionToCandidate({
      member_id: "m1",
      game_type_pref: "都可以",
      gender_pref: "都可以",
      availability: { "2026-04-21": ["上午"] },
      import_metadata: {
        source: "legacy-temp",
        normalized_name: "张三",
        raw_first_choice: "双人本",
        raw_second_choice: "多人本",
        script_activity_pref: "都可以",
        raw_notes: null,
        warnings: [],
        legacy_profile: {
          legacy_id: "l1",
          full_name: "张三",
          gender: "男",
          school: "早稻田大学",
          department: "理工",
          interest_tags: ["本格"],
          social_tags: ["慢热"],
          game_mode: "双人本",
          compatibility_score: 4.6,
          session_count: 3,
          match_history: [],
        },
      },
    }, null, [{ name: "Alice", count: 1 }])

    expect(candidate.name).toBe("张三")
    expect(candidate.school).toBe("早稻田大学")
    expect(candidate.compatibilityScore).toBe(4.6)
    expect(candidate.level).toBe(3)
    expect(candidate.interestTags).toContain("本格")
  })

  it("merges legacy history with live history", () => {
    expect(mergeMatchHistory(
      [{ name: "A", count: 1 }],
      [{ name: "A", count: 2 }, { name: "B", count: 1 }],
    )).toEqual([
      { name: "A", count: 3 },
      { name: "B", count: 1 },
    ])
  })
})
