import { isValidElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ submit: vi.fn(), push: vi.fn(), window: vi.fn(), useState: vi.fn(), useRef: vi.fn() }))
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: mocks.useState, useRef: mocks.useRef }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("next-intl", () => ({ useLocale: () => "zh", useTranslations: () => Object.assign((key: string) => key, { has: () => true }) }))
vi.mock("@/lib/i18n/use-tag-labels", () => ({ useTagLabels: () => ({}) }))
vi.mock("@/lib/matching/use-survey-window", () => ({ useSurveyWindow: mocks.window }))
vi.mock("@/app/app/matching/survey/actions", () => ({ submitSurvey: mocks.submit }))
import { SurveyForm } from "./SurveyForm"
import { normalizeRoundConfig } from "@/lib/matching/round-config"
import { RoundCustomQuestion } from "./RoundCustomQuestion"

type NodeProps = { children?: ReactNode; disabled?: boolean; onClick?: () => Promise<void>; value?: unknown; role?: string }
function find(node: ReactNode, predicate: (type: unknown, props: NodeProps) => boolean): NodeProps | undefined {
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean)
  if (!isValidElement<NodeProps>(node)) return
  return predicate(node.type, node.props) ? node.props : find(node.props.children, predicate)
}

let states: unknown[]
let cursor: number
function render(overrides: Partial<Parameters<typeof SurveyForm>[0]> = {}) {
  cursor = 0
  return SurveyForm({
    roundId: "round", roundName: "Test round", surveyStart: "2026-09-29T00:00:00Z", surveyEnd: "2026-09-29T09:00:00Z",
    initialNow: "2026-09-29T01:00:00Z", activityStart: "2026-10-01", activityEnd: "2026-10-14",
    existing: { game_type_pref: "双人", gender_pref: "都可以", availability: { "2026-10-01": ["下午"] }, interest_tags: [], social_style: null, message: "my answer" },
    ...overrides,
  })
}
function submitButton(tree = render()) {
  const button = find(tree, (_type, props) => Boolean(props.onClick) && props.children === "update")
  if (!button?.onClick) throw new Error("Missing submit button")
  return button as NodeProps & { onClick: () => Promise<void> }
}

describe("survey form expiry and recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime("2026-09-29T01:00:00Z")
    states = []
    mocks.useState.mockImplementation((initial: unknown) => {
      const index = cursor++
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial
      return [states[index], (value: unknown) => { states[index] = value }]
    })
    mocks.useRef.mockImplementation((value: unknown) => ({ current: value }))
    mocks.window.mockReturnValue("open")
    mocks.submit.mockResolvedValue({ success: true })
  })
  afterEach(() => vi.useRealTimers())

  it("keeps entered answers but disables submission and explains closure after the deadline", () => {
    render()
    mocks.window.mockReturnValue("expired")
    const tree = render()
    expect(submitButton(tree).disabled).toBe(true)
    expect(find(tree, (type) => type === "fieldset")?.disabled).toBe(true)
    expect(find(tree, (_type, props) => Boolean(props.value))?.value).toEqual(expect.objectContaining({ message: "my answer" }))
    expect(find(tree, (_type, props) => props.role === "status")?.children).toBe("unavailableWhileFilling")
  })

  it("blocks submission at the exact deadline even before the timer rerenders", async () => {
    const button = submitButton()
    vi.setSystemTime("2026-09-29T09:00:00Z")
    await button.onClick()
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(submitButton().disabled).toBe(true)
  })

  it("preserves the answer and allows retry after a network error", async () => {
    mocks.submit.mockRejectedValueOnce(new Error("network"))
    await submitButton().onClick()
    expect(mocks.push).not.toHaveBeenCalled()
    await submitButton().onClick()
    expect(mocks.submit).toHaveBeenLastCalledWith(expect.objectContaining({ message: "my answer" }))
    expect(mocks.push).toHaveBeenCalledWith("/app/matching/survey/success?roundId=round")
  })

  it("stops further submissions after the server reports manual closure", async () => {
    mocks.submit.mockResolvedValue({ error: "surveyClosed" })
    await submitButton().onClick()
    expect(submitButton().disabled).toBe(true)
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it("ignores duplicate clicks while submitting", async () => {
    let finish!: (value: { success: true }) => void
    mocks.submit.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const button = submitButton()
    const first = button.onClick()
    await button.onClick()
    expect(mocks.submit).toHaveBeenCalledOnce()
    finish({ success: true })
    await first
  })

  it("allows a fixed activity signup without requesting availability", async () => {
    const tree = render({ purpose: "registration", existing: null })
    const button = find(tree, (_type, props) => props.children === "registration.submit")
    expect(button?.disabled).toBe(false)
    await button?.onClick?.()
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ availability: {}, gameTypePref: "都可以" }))
  })

  it("does not show a submit button for an announcement", () => {
    expect(find(render({ purpose: "announcement" }), (_type, props) => Boolean(props.onClick))).toBeUndefined()
  })

  it("blocks missing required custom answers before sending", async () => {
    const config = normalizeRoundConfig({ questions: [{ id: "q1", type: "text", label: { zh: "备注", ja: "" }, required: true, options: [] }] })
    await submitButton(render({ config })).onClick()
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it("allows an optional single choice to be cleared", async () => {
    const onChange = vi.fn()
    const question = { id: "q1", type: "single" as const, label: { zh: "选择", ja: "" }, required: false,
      options: [{ id: "yes", label: { zh: "是", ja: "" } }] }
    const button = find(RoundCustomQuestion({ question, value: "yes", onChange }), (_type, props) => props.children === "clearAnswer")
    await button?.onClick?.()
    expect(onChange).toHaveBeenCalledWith("")
    expect(find(RoundCustomQuestion({ question: { ...question, required: true }, value: "yes", onChange }),
      (_type, props) => props.children === "clearAnswer")).toBeUndefined()
  })
})
