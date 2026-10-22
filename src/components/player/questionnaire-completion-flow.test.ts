import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { QuestionnaireKind, QuestionnaireRuntime } from "@/lib/questionnaires/types"
import { buildDefaultTemplate, quizTemplateToConfig } from "@/lib/questionnaires/defaults"

const mocks = vi.hoisted(() => ({ useState: vi.fn(), useRef: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), supplementary: vi.fn(), personality: vi.fn(), quiz: vi.fn(), markDirty: vi.fn(), markSaved: vi.fn(), confirmLeave: vi.fn() }))
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: mocks.useState, useRef: mocks.useRef }))
vi.mock("@/components/ui/MajorSearchSelect", () => ({ MajorSearchSelect: () => null }))
vi.mock("@/components/ui/SchoolSearchSelect", () => ({ SchoolSearchSelect: () => null }))
vi.mock("@/components/ui/StationSearchSelect", () => ({ StationSearchSelect: () => null }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh, back: mocks.back }) }))
vi.mock("next-intl", () => ({ useLocale: () => "zh", useTranslations: () => Object.assign((key: string) => key, { has: () => true }) }))
vi.mock("./use-questionnaire-unsaved-changes", () => ({ useQuestionnaireUnsavedChanges: () => ({ markDirty: mocks.markDirty, markSaved: mocks.markSaved, confirmLeave: mocks.confirmLeave }) }))
vi.mock("@/app/app/profile/supplementary/actions", () => ({ submitSupplementary: mocks.supplementary }))
vi.mock("@/app/app/profile/personality/actions", () => ({ submitPersonality: mocks.personality }))
vi.mock("@/app/app/profile/quiz/actions", () => ({ submitQuiz: mocks.quiz, startQuizRetake: vi.fn() }))
import { SupplementaryForm } from "./SupplementaryForm"
import { PersonalitySelfAssessment } from "./PersonalitySelfAssessment"
import { QuizPageClient } from "./QuizPageClient"
import { QuestionnaireQuiz } from "./QuestionnaireQuiz"

const context = { roundId: "1731d454-c4e9-49f6-8c6c-1cb7ce8ee4db", fromParticipation: true }
const destination = `/app/profile/complete?round=${context.roundId}&from=participation`
type Props = { children?: ReactNode; role?: string; onClick?: () => void | Promise<void>; onComplete?: (answers: Record<string, string>) => Promise<void>; onAnswerChange?: () => void }
function find(node: ReactNode, predicate: (type: unknown, props: Props) => boolean): Props | undefined {
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean)
  if (!isValidElement<Props>(node)) return
  return predicate(node.type, node.props) ? node.props : find(node.props.children, predicate)
}
function runtime(kind: QuestionnaireKind): QuestionnaireRuntime {
  const template = buildDefaultTemplate(kind)
  // A published single-section questionnaire demonstrates completion independent of the old four-page layout.
  if (kind !== "quiz") {
    template.sections = [{ id: "custom", title: { zh: "资料", ja: "情報" } }]
    template.questions = [{ id: "optional", sectionId: "custom", type: "text", label: { zh: "选填", ja: "任意" }, required: false, active: true, locked: false }]
  }
  return { kind, versionId: "pinned-version", revision: 4, template, answers: {}, isBaseline: false, completed: false }
}
let states: unknown[], refs: { current: unknown }[], stateCursor: number, refCursor: number
function render(kind: "supplementary" | "personality" | "quiz", flow = true) {
  stateCursor = 0; refCursor = 0
  const questionnaire = runtime(kind)
  const shared = { questionnaire, completionContext: flow ? context : null }
  if (kind === "supplementary") return SupplementaryForm({ memberId: "player", ...shared })
  if (kind === "personality") return PersonalitySelfAssessment(shared)
  return QuizPageClient({ existing: null, quizConfig: quizTemplateToConfig(questionnaire.template), ...shared })
}
async function submit(kind: "supplementary" | "personality" | "quiz", flow = true) {
  const tree = render(kind, flow)
  if (kind === "quiz") return find(tree, (type) => type === QuestionnaireQuiz)?.onComplete?.({ question: "answer" })
  const button = find(tree, (_type, props) => props.children === "submit")
  if (!button?.onClick) throw new Error("Missing final submit")
  return button.onClick()
}
beforeEach(() => {
  vi.clearAllMocks(); states = []; refs = []
  mocks.useState.mockImplementation((initial: unknown) => {
    const index = stateCursor++
    if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial
    return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value }]
  })
  mocks.useRef.mockImplementation((initial: unknown) => { const index = refCursor++; return refs[index] ?? (refs[index] = { current: initial }) })
  mocks.supplementary.mockResolvedValue({ success: true })
  mocks.personality.mockResolvedValue({ success: true })
  mocks.quiz.mockResolvedValue({ scores: { E: 50, A: 50, O: 50, C: 50, N: 50 }, personalityType: "balanced" })
  mocks.confirmLeave.mockReturnValue(false)
})

describe("successful questionnaire saves continue the matching completion flow", () => {
  it.each(["supplementary", "personality", "quiz"] as const)("%s saves once then checks the next step for the original activity", async (kind) => {
    await submit(kind)
    expect(mocks[kind]).toHaveBeenCalledOnce()
    expect(mocks.markSaved).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(destination)
    expect(mocks.push).not.toHaveBeenCalled()
  })
  it.each(["supplementary", "personality", "quiz"] as const)("%s remains on the current questionnaire after save failure", async (kind) => {
    mocks[kind].mockResolvedValue({ error: "saveFailed" })
    await submit(kind)
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.markSaved).not.toHaveBeenCalled()
    expect(find(render(kind), (_type, props) => props.role === "alert")).toBeDefined()
  })
  it.each(["supplementary", "personality"] as const)("%s keeps the existing standalone return-to-profile behavior", async (kind) => {
    await submit(kind, false)
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith("/app/profile")
    expect(mocks.replace).not.toHaveBeenCalled()
  })
  it("shows the quiz result for a standalone test without entering registration", async () => {
    await submit("quiz", false)
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })
  it("does not discard answers when cancelling the leave confirmation", async () => {
    const tree = render("personality")
    await find(tree, (_type, props) => props.children === "cancel")?.onClick?.()
    expect(mocks.confirmLeave).toHaveBeenCalledOnce()
    expect(mocks.back).not.toHaveBeenCalled()
  })
  it("notifies the unsaved guard when a quiz answer changes", () => {
    find(render("quiz"), (type) => type === QuestionnaireQuiz)?.onAnswerChange?.()
    expect(mocks.markDirty).toHaveBeenCalledOnce()
  })
})
