import { describe, expect, it } from "vitest"
import { normalizeRoundConfig } from "./round-config"
import { validateSurveyAnswers } from "./survey-answers"
import type { RoundPurpose, SurveyAnswers } from "@/types/matching-round"

const initial: SurveyAnswers = {
  gameTypePref: "双人", genderPref: "都可以", availability: { "2026-10-10": ["下午"] },
  interestTags: ["推理"], socialStyle: "慢热", message: " Hello ", customAnswers: {},
}
const questions = [
  { id: "meal", type: "single", required: true, label: { zh: "餐食", ja: "" }, options: [{ id: "vegetarian", label: { zh: "素食", ja: "" } }] },
  { id: "extras", type: "multi", required: false, label: { zh: "选项", ja: "" }, options: [{ id: "one", label: { zh: "一", ja: "" } }] },
  { id: "memo", type: "text", required: false, label: { zh: "留言", ja: "" }, options: [] },
]
function check(input: unknown = initial, purpose: RoundPurpose = "matching", rawConfig: unknown = {}) {
  return validateSurveyAnswers(input, purpose, normalizeRoundConfig(rawConfig), "2026-10-10", "2026-10-11")
}

describe("matching and activity answers", () => {
  it("keeps matching answers and trims free text", () => {
    expect(check().data).toEqual({ ...initial, message: "Hello" })
  })

  it.each([{}, { "2026-10-10": [] }])("still requires matching availability", (availability) => {
    expect(check({ ...initial, availability }).error).toBe("noTimeSlot")
  })

  it.each([
    { "2026-10-09": ["下午"] }, { "2026-10-12": ["下午"] }, { "2026-10-10": ["凌晨"] },
    { "2026-10-10": ["下午", "下午"] }, { "2026-10-10": "下午" }, null,
  ])("rejects forged dates and time slots", (availability) => {
    expect(check({ ...initial, availability }).error).toBe("invalidSurveyInput")
  })

  it("allows a one-click registration and removes hidden matching data", () => {
    expect(check({ ...initial, availability: {} }, "registration").data).toEqual({
      gameTypePref: "都可以", genderPref: "都可以", availability: {}, interestTags: [], socialStyle: null, message: null, customAnswers: {},
    })
  })

  it("never records an announcement answer", () => {
    expect(check(initial, "announcement").error).toBe("surveyReadOnly")
  })

  it("omits disabled matching modules", () => {
    expect(check(initial, "matching", { modules: { interests: false, social: false, message: false } }).data)
      .toEqual({ ...initial, interestTags: [], socialStyle: null, message: null })
  })

  it.each([{}, { meal: "" }, { meal: [] }])("rejects missing required answers", (customAnswers) => {
    expect(check({ ...initial, customAnswers }, "registration", { questions }).error).toBe("customQuestionRequired")
  })

  it.each([
    { meal: "unknown" }, { meal: ["vegetarian"] }, { meal: "vegetarian", extras: "one" },
    { meal: "vegetarian", extras: ["one", "one"] }, { meal: "vegetarian", extras: ["unknown"] },
    { meal: "vegetarian", unknown: "bad" }, { meal: "vegetarian", memo: "a".repeat(2001) },
  ])("rejects custom answers outside the published structure", (customAnswers) => {
    expect(check({ ...initial, customAnswers }, "registration", { questions }).error).toBe("invalidSurveyInput")
  })

  it("accepts valid single, multi and text answers", () => {
    expect(check({ ...initial, customAnswers: { meal: "vegetarian", extras: ["one"], memo: " hello " } }, "registration", { questions }).data?.customAnswers)
      .toEqual({ meal: "vegetarian", extras: ["one"], memo: "hello" })
  })

  it("checks total UTF-8 answer size before the database byte limit", () => {
    const questions = Array.from({ length: 10 }, (_, index) => ({ id: `q${index}`, type: "text", required: false, label: { zh: "题目", ja: "" }, options: [] }))
    const customAnswers = Object.fromEntries(questions.map((question) => [question.id, "答".repeat(2000)]))
    expect(check({ ...initial, customAnswers }, "registration", { questions }).error).toBe("invalidSurveyInput")
  })
})
