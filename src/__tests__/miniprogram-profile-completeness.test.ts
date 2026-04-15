import { describe, expect, it } from "vitest"
import { calcMiniProfileCompleteness } from "../../packages/miniprogram/src/lib/profile-completeness"

describe("calcMiniProfileCompleteness", () => {
  it("returns 100 when all four sections are complete", () => {
    const result = calcMiniProfileCompleteness({
      member_identity: { full_name: "测试用户" },
      member_language: { communication_language_pref: ["中文", "日语"] },
      member_interests: { activity_frequency: "每月一次" },
      member_personality: {
        expression_style_tags: ["健谈"],
        extroversion: 4,
        initiative: 4,
        emotional_stability: 3,
        warmup_speed: "normal",
      },
      personality_quiz_results: { score_e: 75 },
    })

    expect(result).toEqual({
      identity: true,
      supplementary: true,
      personality: true,
      quiz: true,
      percentage: 100,
    })
  })

  it("requires both language and interests for supplementary", () => {
    const result = calcMiniProfileCompleteness({
      member_identity: { full_name: "测试用户" },
      member_language: { communication_language_pref: ["中文"] },
      member_interests: { activity_frequency: null },
      member_personality: null,
      personality_quiz_results: null,
    })

    expect(result).toEqual({
      identity: true,
      supplementary: false,
      personality: false,
      quiz: false,
      percentage: 25,
    })
  })

  it("requires warmup speed and expression style tags for personality", () => {
    const result = calcMiniProfileCompleteness({
      member_identity: { full_name: "测试用户" },
      member_language: null,
      member_interests: null,
      member_personality: {
        expression_style_tags: [],
        extroversion: 4,
        initiative: 4,
        emotional_stability: 3,
        warmup_speed: null,
      },
      personality_quiz_results: null,
    })

    expect(result).toEqual({
      identity: true,
      supplementary: false,
      personality: false,
      quiz: false,
      percentage: 25,
    })
  })
})
