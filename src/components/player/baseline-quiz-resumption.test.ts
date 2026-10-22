import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildDefaultTemplate, quizTemplateToConfig } from "@/lib/questionnaires/defaults"
import type { QuestionnaireRuntime } from "@/lib/questionnaires/types"
import type { QuizAnswer } from "@/lib/forms/player-enrichment"

const mocks = vi.hoisted(() => ({ state: vi.fn(), ref: vi.fn(), retake: vi.fn() }))
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: mocks.state, useRef: mocks.ref, useMemo: (factory: () => unknown) => factory(), useCallback: (callback: unknown) => callback }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock("next-intl", () => ({ useLocale: () => "zh", useTranslations: () => Object.assign((key: string) => key, { has: () => true }) }))
vi.mock("./use-questionnaire-unsaved-changes", () => ({ useQuestionnaireUnsavedChanges: () => ({ markDirty: vi.fn(), markSaved: vi.fn(), confirmLeave: () => true }) }))
vi.mock("@/app/app/profile/quiz/actions", () => ({ startQuizRetake: mocks.retake, submitQuiz: vi.fn() }))
vi.mock("@/components/ui/SchoolSearchSelect", () => ({ SchoolSearchSelect: () => null }))
vi.mock("@/components/ui/MajorSearchSelect", () => ({ MajorSearchSelect: () => null }))
vi.mock("@/components/ui/StationSearchSelect", () => ({ StationSearchSelect: () => null }))
import { QuizPageClient } from "./QuizPageClient"
import { PersonalityQuiz } from "./PersonalityQuiz"
import { QuizResult } from "./QuizResult"

type Props = { children?: ReactNode; disabled?: boolean; initialAnswers?: QuizAnswer[]; onClick?: () => void; onRetake?: () => Promise<void> }
function find(node: ReactNode, predicate: (type: unknown, props: Props) => boolean): Props | undefined {
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean)
  if (!isValidElement<Props>(node)) return
  return predicate(node.type, node.props) ? node.props : find(node.props.children, predicate)
}
let states: unknown[], refs: { current: unknown }[], stateCursor: number, refCursor: number
const template = buildDefaultTemplate("quiz")
const config = quizTemplateToConfig(template)
const savedAnswer = template.questions[0].options![0]
const current: QuestionnaireRuntime = { kind: "quiz", template, versionId: "baseline-v1", revision: 2, isBaseline: true, completed: false,
  answers: { [template.questions[0].id]: savedAnswer.value, [template.questions[1].id]: "invalid-option", unknown_question: "2" } }
function parent(existing: Parameters<typeof QuizPageClient>[0]["existing"] = null) {
  stateCursor = 0; refCursor = 0
  return QuizPageClient({ existing, quizConfig: config, questionnaire: current })
}
beforeEach(() => {
  vi.clearAllMocks(); states = []; refs = []; stateCursor = 0; refCursor = 0
  mocks.state.mockImplementation((initial: unknown) => {
    const index = stateCursor++
    if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial
    return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value }]
  })
  mocks.ref.mockImplementation((initial: unknown) => { const index = refCursor++; return refs[index] ?? (refs[index] = { current: initial }) })
})

describe("baseline quiz saved-answer resumption", () => {
  it("passes only saved answers valid in the bound baseline version into the legacy renderer", () => {
    const quiz = find(parent(), (type) => type === PersonalityQuiz)
    expect(quiz?.initialAnswers).toEqual([{ questionId: config.questions[0].id, score: savedAnswer.score }])
  })
  it("recognizes a saved zero-score answer without marking it as a new edit", () => {
    const onComplete = vi.fn(); const onAnswerChange = vi.fn()
    const tree = PersonalityQuiz({ questions: [{ id: 1, dimension: "E", text: "Question", options: [{ text: "Zero", score: 0 }, { text: "Three", score: 3 }] }],
      initialAnswers: [{ questionId: 1, score: 0 }], onComplete, onAnswerChange })
    const finish = find(tree, (_type, props) => Array.isArray(props.children) && props.children.includes("finish"))
    expect(finish?.disabled).toBe(false)
    finish?.onClick?.()
    expect(onComplete).toHaveBeenCalledExactlyOnceWith([{ questionId: 1, score: 0 }])
    expect(onAnswerChange).not.toHaveBeenCalled()
  })
  it("does not treat an unknown question or invalid score as an answered required question", () => {
    const tree = PersonalityQuiz({ questions: [{ id: 1, dimension: "E", text: "Question", options: [{ text: "Zero", score: 0 }] }],
      initialAnswers: [{ questionId: 1, score: 9 }, { questionId: 99, score: 0 }], onComplete: vi.fn() })
    const finish = find(tree, (_type, props) => Array.isArray(props.children) && props.children.includes("finish"))
    expect(finish?.disabled).toBe(true)
  })
  it("starts an explicit retake with the fresh session's empty answers, including the same version", async () => {
    const existing = { scores: { E: 50, A: 50, O: 50, C: 50, N: 50 }, personalityType: "balanced" }
    mocks.retake.mockResolvedValue({ questionnaire: { ...current, answers: {}, revision: 3 } })
    await find(parent(existing), (type) => type === QuizResult)?.onRetake?.()
    expect(mocks.retake).toHaveBeenCalledOnce()
    expect(find(parent(existing), (type) => type === PersonalityQuiz)?.initialAnswers).toEqual([])
  })
})
