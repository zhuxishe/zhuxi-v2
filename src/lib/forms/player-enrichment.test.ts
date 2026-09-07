import { describe, expect, it } from "vitest"
import {
  buildPersonalityDraft, buildSupplementaryDraft, parsePersonality, parseQuizAnswers, parseSupplementary,
} from "./player-enrichment"
import { buildDefaultQuizConfig, calculateScores, generatePersonalityType } from "@/lib/constants/personality-quiz"
import { EMPTY_PERSONALITY, EMPTY_SUPPLEMENTARY } from "@/types"

describe("supplementary answers", () => {
  it("keeps unanswered choices unknown and preserves an explicit no after reloading", () => {
    expect(buildSupplementaryDraft(null, null)).toMatchObject({ accept_beginners: null, accept_cross_school: null })
    expect(buildSupplementaryDraft({ hobby_tags: ["游戏"], accept_beginners: true, accept_cross_school: true }, null))
      .toMatchObject({ accept_beginners: null, accept_cross_school: null })
    expect(buildSupplementaryDraft({ accept_beginners: true, accept_cross_school: true }, { communication_language_pref: [] }))
      .toMatchObject({ accept_beginners: true, accept_cross_school: true })
    const restored = buildSupplementaryDraft([{ member_id: "someone", accept_beginners: false, accept_cross_school: true }], null)
    expect(restored).toMatchObject({ accept_beginners: false, accept_cross_school: true })
    expect(restored).not.toHaveProperty("member_id")
  })

  it("normalizes editable payloads while preserving false and all selected preferences", () => {
    const parsed = parseSupplementary({
      ...EMPTY_SUPPLEMENTARY, member_id: "other-member", nearest_station: "  新宿駅  ",
      accept_beginners: false, accept_cross_school: null, graduation_year: 2031,
      communication_language_pref: ["日语", "中文"], scenario_theme_tags: ["推理", "新手友好"],
    })
    expect(parsed).toMatchObject({
      nearest_station: "新宿駅", accept_beginners: false, accept_cross_school: null, graduation_year: 2031,
      communication_language_pref: ["日语", "中文"], scenario_theme_tags: ["推理", "新手友好"],
    })
    expect(parsed).not.toHaveProperty("member_id")
  })

  it.each([
    { accept_beginners: "false" }, { graduation_year: 2027.5 }, { graduation_year: Infinity },
    { communication_language_pref: ["中文", "中文"] }, { scenario_mode_pref: ["not-a-real-option"] },
    { japanese_level: 1 }, { preferred_time_slots: "周六晚" }, { nearest_station: "駅".repeat(101) },
  ])("rejects malformed fields before any database write: %j", (fields) => {
    expect(parseSupplementary({ ...EMPTY_SUPPLEMENTARY, ...fields })).toBeNull()
  })
})

describe("personality self-assessment answers", () => {
  const completed = {
    ...EMPTY_PERSONALITY, extroversion: 3, initiative: 4, emotional_stability: 2,
    expression_style_tags: ["幽默"], group_role_tags: ["组织者"], warmup_speed: "先浅后深",
    planning_style: "半计划", coop_compete_tendency: "均衡", boundary_strength: "适中", reply_speed: "当天",
  }

  it("does not turn an onboarding placeholder or null into a self-assessment response", () => {
    const initial = buildPersonalityDraft({ ...EMPTY_PERSONALITY, personality_tags: ["慢热"] })
    expect(initial).toMatchObject({ extroversion: null, initiative: null, emotional_stability: null })
    expect(parsePersonality(initial)).toBeNull()
    expect(parsePersonality(null)).toBeNull()
  })

  it("restores a genuine neutral score and persists only the ten assessment fields", () => {
    const initial = buildPersonalityDraft(completed)
    expect(initial.extroversion).toBe(3)
    expect(parsePersonality({ ...initial, personality_tags: ["other section"], member_id: "someone" })).toEqual(completed)
  })

  it.each([
    { extroversion: null }, { initiative: 3.5 }, { emotional_stability: 6 }, { group_role_tags: [] },
    { expression_style_tags: ["幽默", "幽默"] }, { boundary_strength: "" }, { reply_speed: "unknown" },
  ])("rejects an incomplete or invalid response: %j", (fields) => {
    expect(parsePersonality({ ...completed, ...fields })).toBeNull()
  })
})

describe("configured quiz scoring", () => {
  const config = buildDefaultQuizConfig()
  // Admin-configured IDs deliberately do not overlap the hardcoded questionnaire.
  config.questions = config.questions.map((question) => ({ ...question, id: question.id + 100 }))
  const answers = config.questions.map((question) => ({ questionId: question.id, score: question.dimension === "E" ? 6 : 1.5 }))

  it("uses the saved question-to-dimension mapping rather than hardcoded question IDs", () => {
    expect(parseQuizAnswers(answers, config)).toEqual(answers)
    expect(calculateScores(answers, config.scoring, config.questions)).toEqual({ E: 100, A: 0, O: 0, C: 0, N: 0 })
    const reassigned = config.questions.map((question) => ({
      ...question, dimension: question.dimension === "E" ? "A" as const : question.dimension === "A" ? "E" as const : question.dimension,
    }))
    expect(calculateScores(answers, config.scoring, reassigned)).toEqual({ E: 0, A: 100, O: 0, C: 0, N: 0 })
  })

  it("requires exactly one supported answer for every current question", () => {
    expect(parseQuizAnswers(answers.slice(1), config)).toBeNull()
    expect(parseQuizAnswers([...answers.slice(1), answers[1]], config)).toBeNull()
    expect(parseQuizAnswers([{ questionId: 999, score: 6 }, ...answers.slice(1)], config)).toBeNull()
    expect(parseQuizAnswers([{ ...answers[0], score: 5 }, ...answers.slice(1)], config)).toBeNull()
    expect(parseQuizAnswers(answers, { ...config, scoring: { ...config.scoring, maxRaw: config.scoring.minRaw } })).toBeNull()
  })

  it("honors configured type labels and the N inversion setting", () => {
    const scores = { E: 80, A: 20, O: 10, C: 30, N: 90 }
    const labels = { prefix: { E: "社交", ES: "感受" }, suffix: { C: "计划型", E: "行动型" } }
    expect(generatePersonalityType(scores, labels, true)).toBe("社交计划型")
    expect(generatePersonalityType(scores, labels, false)).toBe("感受行动型")
  })
})
