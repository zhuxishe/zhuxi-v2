import { describe, expect, it } from "vitest"
import { answersFromLegacy, answersToLegacy, buildDefaultTemplate, isBaselineTemplate, quizAnswersFromTemplate, quizTemplateToConfig } from "./defaults"
import { validateAnswers, validateTemplate } from "./validation"
import type { Answers, Question, Template } from "./types"

function custom(type: Question["type"], patch: Partial<Question> = {}): Question {
  return { id: `custom_${type}`, sectionId: "location", type, label: { zh: "新问题", ja: "新しい質問" }, active: true, required: true, locked: false, ...patch }
}
function extended(...questions: Question[]): Template {
  const template = buildDefaultTemplate("supplementary")
  template.questions.push(...questions)
  return template
}
const choice = [{ id: "one", value: "one_stable", label: { zh: "一", ja: "一" } }, { id: "two", value: "two_stable", label: { zh: "二", ja: "二" } }]

describe("default questionnaire compatibility", () => {
  it.each([["interview", 15, 4], ["supplementary", 19, 4], ["personality", 10, 1], ["quiz", 15, 1]] as const)("preserves %s question count and steps", (kind, count, sections) => {
    const template = buildDefaultTemplate(kind)
    expect(template.questions).toHaveLength(count)
    expect(template.sections).toHaveLength(sections)
    expect(validateTemplate(template)).toMatchObject({ ok: true })
    expect(isBaselineTemplate(template, buildDefaultTemplate(kind))).toBe(true)
  })
  it("preserves real stored values while translating labels", () => {
    const interview = buildDefaultTemplate("interview")
    const hobby = interview.questions.find((q) => q.id === "hobby_tags")!
    expect(hobby.options?.[0]).toMatchObject({ value: "剧本杀", label: { zh: "剧本杀", ja: "マーダーミステリー" } })
    expect(hobby.maxSelections).toBe(8)
    const required = interview.questions.filter((q) => q.required).map((q) => q.id)
    expect(required).toEqual(["full_name", "gender", "birth_date", "nationality", "current_city", "school_name", "degree_level", "hobby_tags", "activity_type_tags", "personality_self_tags"])
  })
  it("does not leak edits into later baseline builds", () => {
    const quiz = buildDefaultTemplate("quiz")
    quiz.quizConfig!.questions[0].options[0].score = 99
    quiz.questions[0].options![0].label.zh = "Changed"
    expect(buildDefaultTemplate("quiz").quizConfig!.questions[0].options[0].score).toBe(6)
    expect(isBaselineTemplate(quiz, buildDefaultTemplate("quiz"))).toBe(false)
  })
  it("keeps boolean false, numeric years and excluded database metadata distinct", () => {
    const template = buildDefaultTemplate("supplementary")
    const answers = answersFromLegacy(template, { member_id: "private", accept_beginners: false, graduation_year: 2025 })
    expect(answers).toEqual({ accept_beginners: false, graduation_year: 2025 })
    expect(answersToLegacy(template, { ...answers, accept_cross_school: "false", custom_text: "extra" })).toEqual({ accept_beginners: false, graduation_year: 2025, accept_cross_school: false })
  })
})

describe("template version protection", () => {
  it("rejects attempts to forge or detach builtin identities", () => {
    for (const change of [(q: Question) => { q.locked = false }, (q: Question) => { delete q.builtinField }, (q: Question) => { q.type = "textarea" }, (q: Question) => { q.sectionId = "academic" }]) {
      const template = buildDefaultTemplate("interview")
      change(template.questions[0])
      expect(validateTemplate(template).ok).toBe(false)
    }
    const template = extended(custom("text", { builtinField: "full_name" }))
    expect(validateTemplate(template).ok).toBe(false)
  })
  it("does not allow removing existing custom questions or redefining stored choices", () => {
    const previous = extended(custom("single", { options: choice }))
    const renamed = structuredClone(previous)
    renamed.questions.at(-1)!.options![0].value = "replacement"
    expect(validateTemplate(renamed, previous).ok).toBe(false)
    expect(validateTemplate(buildDefaultTemplate("supplementary"), previous).ok).toBe(false)
    const inactive = structuredClone(previous)
    inactive.questions.at(-1)!.active = false
    expect(validateTemplate(inactive, previous).ok).toBe(true)
  })
  it("allows labels and within-step order changes while preserving stored option values", () => {
    const template = buildDefaultTemplate("interview")
    template.questions[2].options![0].label.zh = "男性"
    ;[template.questions[0], template.questions[1]] = [template.questions[1], template.questions[0]]
    expect(validateTemplate(template).ok).toBe(true)
  })
  it("allows appending ordinary mapped options while keeping enum-backed choices fixed", () => {
    const template = buildDefaultTemplate("supplementary")
    template.questions.find((q) => q.id === "activity_area")!.options!.push({ id: "new_area", value: "川崎", label: { zh: "川崎", ja: "川崎" } })
    expect(validateTemplate(template).ok).toBe(true)
    expect(validateAnswers(template, { activity_area: "川崎" })).toMatchObject({ ok: true, data: { activity_area: "川崎" } })
    const interview = buildDefaultTemplate("interview")
    interview.questions.find((q) => q.id === "gender")!.options!.push({ id: "new_gender", value: "invalid_enum", label: { zh: "新", ja: "新" } })
    expect(validateTemplate(interview).ok).toBe(false)
  })
  it("protects core requirements and fixed flow structure", () => {
    const template = buildDefaultTemplate("interview")
    template.questions[0].required = false
    expect(validateTemplate(template).ok).toBe(false)
    template.questions[0].required = true
    template.questions[0].active = false
    expect(validateTemplate(template).ok).toBe(false)
    const supplementary = buildDefaultTemplate("supplementary")
    supplementary.sections.reverse()
    expect(validateTemplate(supplementary).ok).toBe(false)
  })
  it("rejects unknown keys, duplicate IDs, duplicate stored values, unsafe keys and malformed sections without throwing", () => {
    const samples: unknown[] = [
      { ...buildDefaultTemplate("supplementary"), sql: "DROP TABLE members" },
      { ...buildDefaultTemplate("supplementary"), sections: [null] },
      extended(custom("single", { options: [choice[0], { ...choice[1], value: choice[0].value }] })),
      extended(custom("text", { id: "constructor" })),
      extended(custom("number", { min: Number.NEGATIVE_INFINITY })),
      extended(custom("text", { maxLength: 20_001 })),
    ]
    const duplicate = buildDefaultTemplate("interview")
    duplicate.questions.push(structuredClone(duplicate.questions[0]))
    samples.push(duplicate)
    for (const sample of samples) expect(validateTemplate(sample).ok).toBe(false)
  })
  it("rejects broken scoring and does not silently fall back to current configuration", () => {
    const template = buildDefaultTemplate("quiz")
    template.quizConfig!.scoring.maxRaw = template.quizConfig!.scoring.minRaw
    expect(validateTemplate(template).ok).toBe(false)
    const weights = buildDefaultTemplate("quiz")
    weights.quizConfig!.dimensions.E.matchWeight = 1
    expect(validateTemplate(weights).ok).toBe(false)
    const score = buildDefaultTemplate("quiz")
    score.questions[0].options![0].score = Number.NaN
    expect(validateTemplate(score).ok).toBe(false)
  })
})

describe("answers bound to a fixed questionnaire version", () => {
  const newQuestions = [custom("text", { maxLength: 5 }), custom("textarea", { maxLength: 10 }), custom("single", { options: choice }), custom("multi", { options: choice, maxSelections: 1 }), custom("number", { min: -5, max: 5 }), custom("date"), custom("rating", { min: 1, max: 5 })]
  const answers: Answers = { custom_text: "hello", custom_textarea: "notes", custom_single: "one_stable", custom_multi: ["two_stable"], custom_number: 0, custom_date: "2024-02-29", custom_rating: 5 }
  it("supports all seven types, trims prose and preserves false instead of treating it as missing", () => {
    const template = extended(...newQuestions)
    const result = validateAnswers(template, { ...answers, accept_beginners: false })
    expect(result).toMatchObject({ ok: true, data: { ...answers, accept_beginners: false } })
  })
  it.each([
    ["custom_number", Number.POSITIVE_INFINITY], ["custom_number", "1"], ["custom_number", 6],
    ["custom_date", "2025-02-29"], ["custom_date", "2024-02-30"], ["custom_date", "2024-01-01T00:00:00Z"],
    ["custom_rating", 3.5], ["custom_single", "一"], ["custom_multi", ["one_stable", "one_stable"]],
    ["custom_multi", ["one_stable", "two_stable"]], ["custom_text", "too long"], ["custom_textarea", " "],
  ])("rejects invalid %s answer %j", (key, value) => {
    expect(validateAnswers(extended(...newQuestions), { ...answers, [key]: value }).ok).toBe(false)
  })
  it("rejects unknown answers and altered inactive answers, even on draft saves", () => {
    const template = extended(custom("text", { active: false }))
    expect(validateAnswers(template, { unknown: 1 }, { allowIncomplete: true }).ok).toBe(false)
    expect(validateAnswers(template, { custom_text: "new" }, { existingAnswers: { custom_text: "saved" }, allowIncomplete: true }).ok).toBe(false)
    expect(validateAnswers(template, { custom_text: "saved" }, { existingAnswers: { custom_text: "saved" }, allowIncomplete: true })).toMatchObject({ ok: true, data: { custom_text: "saved" } })
    expect(validateAnswers(template, JSON.parse('{"__proto__":"polluted"}'), { allowIncomplete: true }).ok).toBe(false)
  })
  it("validates just the requested section and cannot overwrite another section", () => {
    const template = buildDefaultTemplate("interview")
    const basic = { full_name: "测试", nickname: "", gender: "male", birth_date: "2000-02-29", nationality: "中国大陆", current_city: "东京都" }
    expect(validateAnswers(template, basic, { sectionId: "basic", existingAnswers: { department: "保存済み" } })).toMatchObject({ ok: true, data: { department: "保存済み", ...basic } })
    expect(validateAnswers(template, { ...basic, department: "Injected" }, { sectionId: "basic", existingAnswers: { department: "保存済み" } })).toMatchObject({ ok: true, data: { department: "保存済み", ...basic } })
    expect(validateAnswers(template, {}, { sectionId: "missing", allowIncomplete: true }).ok).toBe(false)
  })
  it("retains an old option only when it was actually saved for this member", () => {
    const template = buildDefaultTemplate("supplementary")
    expect(validateAnswers(template, { ideal_group_size: "6-7人", graduation_year: 2025 }).ok).toBe(false)
    expect(validateAnswers(template, { ideal_group_size: "6-7人", graduation_year: 2025 }, { existingAnswers: { ideal_group_size: "6-7人", graduation_year: 2025 } })).toMatchObject({ ok: true, data: { ideal_group_size: "6-7人", graduation_year: 2025 } })
  })
  it("an old session accepts its own choices after a later version changes options", () => {
    const old = extended(custom("single", { options: choice }))
    const newer = structuredClone(old)
    newer.questions.at(-1)!.options = [{ id: "new_choice", value: "new_stable", label: { zh: "新", ja: "新" } }]
    expect(validateAnswers(old, { custom_single: "one_stable" }).ok).toBe(true)
    expect(validateAnswers(newer, { custom_single: "one_stable" }).ok).toBe(false)
  })
  it("birthdays reject future dates and invalid leap days", () => {
    const template = buildDefaultTemplate("interview")
    expect(validateAnswers(template, { birth_date: "2999-01-01" }, { allowIncomplete: true }).ok).toBe(false)
    expect(validateAnswers(template, { birth_date: "2001-02-29" }, { allowIncomplete: true }).ok).toBe(false)
  })
  it("score edits use selected stable option values to compute the fixed-version score", () => {
    const template = buildDefaultTemplate("quiz")
    template.questions[0].label.zh = "新题目"
    template.questions[0].options![0].score = 5
    template.questions.push(custom("text", { id: "quiz_note", sectionId: "quiz", required: false }))
    expect(validateTemplate(template).ok).toBe(true)
    expect(quizTemplateToConfig(template).questions).toHaveLength(15)
    expect(quizTemplateToConfig(template).questions[0]).toMatchObject({ id: 1, text: "新题目", options: [{ text: template.questions[0].options![0].label.zh, score: 5 }, ...template.quizConfig!.questions[0].options.slice(1)] })
    expect(quizAnswersFromTemplate(template, { quiz_1: "6" })).toEqual([{ questionId: 1, score: 5 }])
  })
  it("accepts a new scored question with a nonnumeric stable option value", () => {
    const template = buildDefaultTemplate("quiz")
    template.questions.push(custom("single", { id: "extra_score", sectionId: "quiz", dimension: "E", options: choice.map((o, i) => ({ ...o, score: i + 1 })) }))
    expect(validateTemplate(template).ok).toBe(true)
    expect(validateAnswers(template, { extra_score: "one_stable" }, { allowIncomplete: true })).toMatchObject({ ok: true, data: { extra_score: "one_stable" } })
    expect(quizAnswersFromTemplate(template, { extra_score: "one_stable" })[0].score).toBe(1)
  })
})
