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

  it("unwraps array-shaped supabase relations before building the candidate", () => {
    const candidate = submissionToCandidate({
      member_id: "m2",
      game_type_pref: "双人",
      gender_pref: "都可以",
      availability: { "2026-04-22": ["晚上"] },
      import_metadata: null,
    }, {
      attractiveness_score: 5,
      member_identity: [{
        full_name: "李四",
        gender: "female",
        school_name: "东京大学",
        hobby_tags: ["推理"],
        personality_self_tags: ["慢热"],
        taboo_tags: ["恐怖"],
        current_city: "东京",
      }],
      member_interests: [{
        scenario_mode_pref: ["双人本"],
        scenario_theme_tags: ["情感"],
        accept_beginners: false,
        accept_cross_school: false,
        activity_area: "新宿",
      }],
      member_personality: [{
        expression_style_tags: ["理性"],
        group_role_tags: ["辅助"],
        warmup_speed: "慢热",
      }],
      member_dynamic_stats: [{
        activity_count: 6,
        reliability_score: 4.2,
      }],
      member_boundaries: [{
        taboo_tags: ["剧透"],
        deal_breakers: ["迟到"],
      }],
      member_language: [{
        communication_language_pref: ["日语", "中文"],
        japanese_level: "N1",
      }],
      personality_quiz_results: [{
        score_e: 10,
        score_a: 11,
        score_o: 12,
        score_c: 13,
        score_n: 14,
      }],
    }, [])

    expect(candidate.name).toBe("李四")
    expect(candidate.gender).toBe("女")
    expect(candidate.school).toBe("东京大学")
    expect(candidate.gameMode).toBe("双人本")
    expect(candidate.interestTags).toEqual(expect.arrayContaining(["推理", "双人本", "情感"]))
    expect(candidate.socialTags).toEqual(expect.arrayContaining(["慢热", "理性", "辅助"]))
    expect(candidate.tabooTags).toEqual(expect.arrayContaining(["恐怖", "剧透", "迟到"]))
    expect(candidate.languagePref).toEqual(["日语", "中文"])
    expect(candidate.japaneseLevel).toBe("N1")
    expect(candidate.quizScores).toEqual({ E: 10, A: 11, O: 12, C: 13, N: 14 })
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
