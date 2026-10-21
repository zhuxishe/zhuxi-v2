import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { buildDefaultTemplate, answersFromLegacy } from "@/lib/questionnaires/defaults"
import { validateAnswers } from "@/lib/questionnaires/validation"
import { questionnaireContext } from "./questionnaire-client"
import { buildPersonalityDraft } from "@/lib/forms/player-enrichment"
import { EMPTY_FORM } from "@/types"
import type { QuestionnaireQuestion, QuestionnaireRuntime } from "@/lib/questionnaires/types"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }))
vi.mock("next-intl", () => ({ NextIntlClientProvider: ({ children }: { children: import("react").ReactNode }) => children, useLocale: () => "zh", useTranslations: () => Object.assign((key: string) => key, { has: () => true }) }))
vi.mock("@/app/app/interview-form/actions", () => ({ savePreInterviewStep: vi.fn(), submitPreInterviewForm: vi.fn() }))
vi.mock("@/app/app/profile/supplementary/actions", () => ({ submitSupplementary: vi.fn() }))
vi.mock("@/app/app/profile/personality/actions", () => ({ submitPersonality: vi.fn() }))
vi.mock("@/app/app/profile/quiz/actions", () => ({ submitQuiz: vi.fn(), startQuizRetake: vi.fn() }))
vi.mock("@/components/ui/SchoolSearchSelect", () => ({ SchoolSearchSelect: () => createElement("input", { "data-control": "school-search" }) }))
vi.mock("@/components/ui/MajorSearchSelect", () => ({ MajorSearchSelect: () => createElement("input", { "data-control": "major-search" }) }))
vi.mock("@/components/ui/StationSearchSelect", () => ({ StationSearchSelect: () => createElement("input", { "data-control": "station-search" }) }))

import { QuestionnaireFields, QuestionnairePreview } from "./QuestionnaireFields"
import { PreInterviewForm } from "./PreInterviewForm"
import { SupplementaryForm } from "./SupplementaryForm"
import { PersonalitySelfAssessment } from "./PersonalitySelfAssessment"
import { QuizPageClient } from "./QuizPageClient"
import { buildDefaultQuizConfig } from "@/lib/constants/personality-quiz"

function runtime(kind: QuestionnaireRuntime["kind"], legacy: object = {}): QuestionnaireRuntime {
  const template = buildDefaultTemplate(kind)
  return { kind, versionId: "baseline-version", template, answers: answersFromLegacy(template, legacy as Record<string, unknown>), isBaseline: true, completed: false, revision: 0 }
}

describe("existing form layout compatibility", () => {
  it.each([0, 1, 2, 3] as const)("keeps interview step %i DOM unchanged with an unedited published baseline", (initialStep) => {
    const props = { defaultValues: EMPTY_FORM, initialStep }
    const original = renderToStaticMarkup(createElement(PreInterviewForm, props))
    const pinned = renderToStaticMarkup(createElement(PreInterviewForm, { ...props, questionnaire: runtime("interview", EMPTY_FORM) }))
    expect(pinned).toBe(original)
    expect(pinned).not.toContain('role="group"')
  })

  it("keeps supplementary layout and navigation unchanged for baseline", () => {
    expect(renderToStaticMarkup(createElement(SupplementaryForm, { memberId: "member", questionnaire: runtime("supplementary") })))
      .toBe(renderToStaticMarkup(createElement(SupplementaryForm, { memberId: "member" })))
  })

  it("keeps all ten personality cards unchanged for baseline", () => {
    expect(renderToStaticMarkup(createElement(PersonalitySelfAssessment, { questionnaire: runtime("personality") })))
      .toBe(renderToStaticMarkup(createElement(PersonalitySelfAssessment)))
  })

  it("keeps the original one-question quiz layout for baseline", () => {
    const quizConfig = buildDefaultQuizConfig()
    expect(renderToStaticMarkup(createElement(QuizPageClient, { existing: null, quizConfig, questionnaire: runtime("quiz") })))
      .toBe(renderToStaticMarkup(createElement(QuizPageClient, { existing: null, quizConfig })))
  })
})

describe("published template rendering", () => {
  const question = (type: QuestionnaireQuestion["type"], patch: Partial<QuestionnaireQuestion> = {}): QuestionnaireQuestion => ({
    id: `custom_${type}`, sectionId: "location", type, label: { zh: `${type}题目`, ja: `${type}設問` }, description: { zh: "说明文字", ja: "説明" }, required: true, active: true, locked: false, ...patch,
  })
  it("renders all seven types, stable option values and configured display labels", () => {
    const template = buildDefaultTemplate("supplementary")
    template.questions = [question("text", { maxLength: 30 }), question("textarea", { maxLength: 50 }), question("number", { min: 2, max: 8 }), question("date"), question("rating", { min: 1, max: 5 }),
      question("single", { options: [{ id: "a", value: "stable_a", label: { zh: "新的显示文字", ja: "変更後" } }] }),
      question("multi", { maxSelections: 1, options: [{ id: "b", value: "stable_b", label: { zh: "多选显示文字", ja: "複数" } }] }),
      question("text", { id: "hidden", label: { zh: "隐藏题", ja: "非表示" }, active: false })]
    const html = renderToStaticMarkup(createElement(QuestionnaireFields, { template, answers: { custom_single: "stable_a", custom_rating: 3 }, onChange: vi.fn(), sectionId: "location" }))
    for (const content of ['type="text"', '<textarea', 'type="number"', 'type="date"', 'maxLength="30"', 'min="2"', 'max="8"', "新的显示文字", "多选显示文字", 'aria-pressed="true"']) expect(html).toContain(content)
    expect(html).not.toContain("隐藏题")
    expect(html).not.toContain("stable_a</")
    expect(html).toContain("说明文字")
  })

  it("renders only this existing section and enforces its required/max constraints", () => {
    const template = buildDefaultTemplate("supplementary")
    template.questions = [question("text", { id: "first", maxLength: 3 }), question("number", { id: "other", sectionId: "social", min: 1, max: 5 })]
    const html = renderToStaticMarkup(createElement(QuestionnaireFields, { template, answers: {}, onChange: vi.fn(), sectionId: "location" }))
    expect(html).toContain("text题目")
    expect(html).not.toContain("number题目")
    expect(validateAnswers(template, {}, { sectionId: "location" }).ok).toBe(false)
    expect(validateAnswers(template, { first: "abcd" }, { sectionId: "location" }).ok).toBe(false)
    expect(validateAnswers(template, { first: "abc" }, { sectionId: "location" }).ok).toBe(true)
    expect(validateAnswers(template, { first: "abc" }).ok).toBe(false)
  })

  it("retains existing school, major, station and birthday controls", () => {
    const interview = buildDefaultTemplate("interview")
    const interviewHtml = renderToStaticMarkup(createElement(QuestionnaireFields, { template: interview, answers: {}, onChange: vi.fn() }))
    expect(interviewHtml).toContain('data-control="school-search"')
    expect(interviewHtml).toContain('data-control="major-search"')
    expect(interviewHtml).toContain('aria-haspopup="dialog"')
    const supplementaryHtml = renderToStaticMarkup(createElement(QuestionnaireFields, { template: buildDefaultTemplate("supplementary"), answers: {}, onChange: vi.fn() }))
    expect(supplementaryHtml).toContain('data-control="station-search"')
  })

  it("does not display an inactive personality question or invent a neutral answer for submission", () => {
    const configured = runtime("personality")
    configured.isBaseline = false
    configured.template.questions[0].active = false
    const html = renderToStaticMarkup(createElement(PersonalitySelfAssessment, { questionnaire: configured }))
    expect(html).not.toContain("外向度")
    expect(questionnaireContext(configured, buildPersonalityDraft(null))?.answers).not.toHaveProperty("extroversion")
  })

  it("shows one quiz question at a time in local preview without submitting", () => {
    const html = renderToStaticMarkup(createElement(QuestionnairePreview, { template: buildDefaultTemplate("quiz") }))
    expect(html).toContain("1 / 15")
    expect(html).not.toContain("周五晚上，室友说")
    expect(html).toContain("nextQuestion")
  })
})
