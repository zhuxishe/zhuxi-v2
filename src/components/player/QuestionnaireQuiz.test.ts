import { createElement, isValidElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildDefaultQuizConfig } from "@/lib/constants/personality-quiz"
import { buildDefaultTemplate, quizAnswersFromTemplate } from "@/lib/questionnaires/defaults"
import { quizOptionSeed, shuffleWithSeed } from "@/lib/questionnaires/quiz-order"
import type { QuestionnaireAnswers, QuestionnaireQuestion, QuestionnaireTemplate } from "@/lib/questionnaires/types"

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }))
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>()
  return {
    ...actual,
    useMemo: (factory: () => unknown) => factory(),
    useCallback: (callback: unknown) => callback,
    useState: (initial: unknown) => {
      if (hooks.cursor >= hooks.values.length) return actual.useState(initial)
      const index = hooks.cursor++
      return [hooks.values[index], (update: unknown) => {
        hooks.values[index] = typeof update === "function" ? update(hooks.values[index]) : update
      }]
    },
  }
})
vi.mock("next-intl", () => ({ NextIntlClientProvider: ({ children }: { children: ReactNode }) => children, useLocale: () => "zh", useTranslations: () => (key: string) => key }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/components/ui/SchoolSearchSelect", () => ({ SchoolSearchSelect: () => null }))
vi.mock("@/components/ui/MajorSearchSelect", () => ({ MajorSearchSelect: () => null }))
vi.mock("@/components/ui/StationSearchSelect", () => ({ StationSearchSelect: () => null }))

import { PersonalityQuiz } from "./PersonalityQuiz"
import { QuestionnaireQuiz } from "./QuestionnaireQuiz"

// Captured from the original component before extracting its shuffle function.
// These fixtures make the legacy comparison independent of the shared helper.
const originalQuestionOrder = [15, 9, 3, 2, 4, 11, 5, 1, 6, 8, 7, 10, 13, 12, 14]
const originalOptionOrders: Record<number, number[]> = {
  1: [3, 1, 0, 2], 2: [3, 1, 2, 0], 3: [3, 1, 0, 2], 4: [1, 3, 2, 0], 5: [1, 3, 0, 2],
  6: [1, 0, 2, 3], 7: [2, 0, 3, 1], 8: [1, 0, 2, 3], 9: [2, 0, 3, 1], 10: [1, 0, 2, 3],
  11: [2, 0, 3, 1], 12: [1, 0, 2, 3], 13: [2, 3, 1, 0], 14: [1, 0, 3, 2], 15: [2, 3, 1, 0],
}
const config = buildDefaultQuizConfig()

function state(values: unknown[]) {
  hooks.values = [...values]
  hooks.cursor = 0
}
function decode(text: string): string {
  return text.replace(/<[^>]+>/g, "").replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">")
}
function content(html: string) {
  return {
    question: decode(/<p class="text-base font-medium leading-relaxed">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? ""),
    options: [...html.matchAll(/<span class="text-sm leading-relaxed">([\s\S]*?)<\/span>/g)].map((match) => decode(match[1])),
  }
}
function visualMarkup(html: string) {
  // The new renderer retains accessible option-group and pressed-state metadata.
  return html.replace(/ (?:role="group"|aria-label="[^"]*"|aria-pressed="[^"]*"|type="button"|id="[^"]*")/g, "")
}
function renderedLegacy(current: number, answers: Record<number, number> = {}) {
  state([current, answers])
  return renderToStaticMarkup(createElement(PersonalityQuiz, { questions: config.questions, onComplete: vi.fn() }))
}
function renderedTemplate(template: QuestionnaireTemplate, current: number, answers: QuestionnaireAnswers = {}) {
  state([current, answers, false])
  return renderToStaticMarkup(createElement(QuestionnaireQuiz, { template }))
}
function elements(node: ReactNode): import("react").ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<{ children?: ReactNode }>(node)) return []
  return [node as import("react").ReactElement<Record<string, unknown>>, ...elements(node.props.children)]
}
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(text).join("")
  return isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : ""
}
function view(template: QuestionnaireTemplate, current: number, answers: QuestionnaireAnswers, onComplete = vi.fn()) {
  state([current, answers, false])
  return QuestionnaireQuiz({ template, onComplete })
}
function navigation(tree: ReactNode, label: string) {
  const found = elements(tree).find((element) => text(element.props.children as ReactNode) === label && typeof element.props.onClick === "function")
  if (!found) throw new Error(`Missing navigation ${label}`)
  return found.props as { disabled: boolean; onClick: () => void }
}
function singleQuestion(patch: Partial<QuestionnaireQuestion> = {}): QuestionnaireQuestion {
  return { id: "custom_7da5-question", sectionId: "quiz", type: "single", label: { zh: "自定义问题", ja: "追加の質問" }, required: true, active: true, locked: false,
    options: ["alpha", "beta", "gamma", "delta"].map((value) => ({ id: value, value, label: { zh: value, ja: value } })), ...patch }
}
function withQuestions(questions: QuestionnaireQuestion[]) {
  return { ...buildDefaultTemplate("quiz"), questions }
}

beforeEach(() => state([]))

describe("original and versioned quiz rendering", () => {
  it.each(originalQuestionOrder.map((id, index) => ({ id, index })))("keeps original question $id and its option order at screen $index", ({ id, index }) => {
    const template = buildDefaultTemplate("quiz")
    const original = renderedLegacy(index)
    const versioned = renderedTemplate(template, index)
    const question = config.questions.find((question) => question.id === id)!
    expect(content(original)).toEqual({ question: question.text, options: originalOptionOrders[id].map((option) => question.options[option].text) })
    expect(content(versioned)).toEqual(content(original))
    expect(visualMarkup(versioned)).toBe(visualMarkup(original))
    expect(versioned).not.toContain('class="ml-1 text-destructive"')
  })

  it("keeps the same selected option and navigation when a published wording changes", () => {
    const template = buildDefaultTemplate("quiz")
    const id = originalQuestionOrder[0]
    const configured = template.questions.find((question) => question.id === `quiz_${id}`)!
    configured.label = { zh: "后台修改后的题干", ja: "変更された質問" }
    configured.options![0].label.zh = "后台修改后的选项"
    const selected = Number(configured.options![0].value)
    const legacy = renderedLegacy(0, { [id]: selected })
    const modified = renderedTemplate(template, 0, { [configured.id]: selected })
    expect(content(modified).question).toBe("后台修改后的题干")
    expect(content(modified).options).toEqual(originalOptionOrders[id].map((index) => configured.options![index].label.zh))
    expect(modified).toContain('aria-pressed="true"')
    expect(modified.match(/bg-primary\/10 ring-primary/g)?.length).toBe(legacy.match(/bg-primary\/10 ring-primary/g)?.length)
    expect(modified).toContain('width:7%')
  })
})

describe("custom question identity and data preservation", () => {
  it("shuffles added nonnumeric IDs deterministically without changing stored template data", () => {
    const template = withQuestions([singleQuestion(), singleQuestion({ id: "another_custom-id", label: { zh: "另一题", ja: "別の質問" } }), singleQuestion({ id: "third_custom-id" })])
    const before = structuredClone(template)
    const first = Array.from({ length: template.questions.length }, (_, index) => content(renderedTemplate(template, index)))
    const again = Array.from({ length: template.questions.length }, (_, index) => content(renderedTemplate(template, index)))
    expect(first).toEqual(again)
    expect(template).toEqual(before)
    expect(quizOptionSeed(template.questions[0])).toBe(quizOptionSeed(structuredClone(template.questions[0])))
    expect(quizOptionSeed({ id: "quiz_15", builtinField: "quiz_15" })).toBe(15 * 137)
    expect(shuffleWithSeed([1, 2, 3], 42)).toHaveLength(3)
  })

  it("stores the stable option value rather than its shuffled position or edited score", () => {
    const template = buildDefaultTemplate("quiz")
    const question = template.questions[14]
    question.options![0].score = 9
    template.questions = [question]
    const onComplete = vi.fn()
    let tree = view(template, 0, {}, onComplete)
    const option = elements(tree).find((element) => element.type === "button" && element.key === question.options![0].id)!
    ;(option.props.onClick as () => void)()
    const answers = hooks.values[1] as QuestionnaireAnswers
    expect(answers).toEqual({ [question.id]: question.options![0].value })
    tree = view(template, 0, answers, onComplete)
    navigation(tree, "finish").onClick()
    expect(onComplete).toHaveBeenCalledWith(answers)
    expect(quizAnswersFromTemplate(template, answers)).toEqual([{ questionId: 15, score: 9 }])
  })
})

describe("configured required checks", () => {
  it("keeps an unanswered required question blocked even without the visual asterisk", () => {
    const template = withQuestions([singleQuestion()])
    const onComplete = vi.fn()
    const tree = view(template, 0, {}, onComplete)
    const finish = navigation(tree, "finish")
    expect(finish.disabled).toBe(true)
    finish.onClick()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it("blocks the next step and final completion when a required earlier answer is missing", () => {
    const template = withQuestions([singleQuestion({ id: "required_text", type: "text", options: undefined, maxLength: 3 }), singleQuestion({ id: "optional_choice", required: false })])
    expect(navigation(view(template, 0, {}), "nextQuestion").disabled).toBe(true)
    expect(navigation(view(template, 0, { required_text: "long" }), "nextQuestion").disabled).toBe(true)
    expect(navigation(view(template, 0, { required_text: "ok" }), "nextQuestion").disabled).toBe(false)
    const onComplete = vi.fn()
    const finish = navigation(view(template, 1, {}, onComplete), "finish")
    expect(finish.disabled).toBe(true)
    finish.onClick()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it("allows optional questions to be skipped while still validating supplied values", () => {
    const template = withQuestions([singleQuestion({ required: false })])
    const onComplete = vi.fn()
    const optional = navigation(view(template, 0, {}, onComplete), "finish")
    expect(optional.disabled).toBe(false)
    optional.onClick()
    expect(onComplete).toHaveBeenCalledWith({})
    const invalid = navigation(view(template, 0, { [template.questions[0].id]: "unknown" }), "finish")
    expect(invalid.disabled).toBe(true)
  })

  it("validates newly added question types before moving forward or finishing", () => {
    const question = singleQuestion({ id: "custom_text-id", type: "text", options: undefined, maxLength: 3 })
    const template = withQuestions([question])
    expect(navigation(view(template, 0, {}), "finish").disabled).toBe(true)
    expect(navigation(view(template, 0, { [question.id]: "long" }), "finish").disabled).toBe(true)
    expect(navigation(view(template, 0, { [question.id]: "ok" }), "finish").disabled).toBe(false)
  })
})
