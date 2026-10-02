import { isValidElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ submit: vi.fn(), push: vi.fn(), window: vi.fn(), useState: vi.fn(), useRef: vi.fn() }))
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: mocks.useState, useRef: mocks.useRef, useEffect: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("next-intl", () => ({ useLocale: () => "zh", useTranslations: () => Object.assign((key: string) => key, { has: () => true }) }))
vi.mock("@/lib/i18n/use-tag-labels", () => ({ useTagLabels: () => ({}) }))
vi.mock("@/lib/matching/use-survey-window", () => ({ useSurveyWindow: mocks.window }))
vi.mock("@/app/app/matching/survey/actions", () => ({ submitSurvey: mocks.submit }))
vi.mock("@/app/app/matching/survey/cancellation-actions", () => ({ cancelRegistration: vi.fn() }))
import { SurveyForm } from "./SurveyForm"
import { SurveyActionBar } from "./SurveyActionBar"
import { RoundFormFields } from "./RoundFormFields"
import { CancelRegistrationButton } from "./CancelRegistrationButton"
import { Button } from "@/components/ui/button"
import { normalizeRoundConfig } from "@/lib/matching/round-config"

function find<P>(node: ReactNode, type: unknown): P | undefined {
  if (Array.isArray(node)) return node.map((child) => find<P>(child, type)).find(Boolean)
  if (!isValidElement<{ children?: ReactNode }>(node)) return
  return node.type === type ? node.props as P : find<P>(node.props.children, type)
}
const config = normalizeRoundConfig({ questions: [
  { id: "note", type: "text", label: { zh: "备注", ja: "" }, required: false, options: [] },
  { id: "choices", type: "multi", label: { zh: "偏好", ja: "" }, required: false, options: [
    { id: "a", label: { zh: "A", ja: "" } }, { id: "b", label: { zh: "B", ja: "" } },
  ] },
] })
const existing = { game_type_pref: "都可以", gender_pref: "都可以", availability: {}, interest_tags: [], social_style: null, message: null,
  custom_answers: { note: "原有备注", choices: ["a", "b"] }, updated_at: "2026-09-29T00:30:00.123456Z" }
let states: unknown[], refs: { current: unknown }[], cursor: number, refCursor: number
function render(overrides: Partial<Parameters<typeof SurveyForm>[0]> = {}) {
  cursor = 0; refCursor = 0
  return SurveyForm({ roundId: "round", roundName: "活动", purpose: "registration", config, existing,
    surveyStart: "2026-09-29T00:00:00Z", surveyEnd: "2026-09-29T09:00:00Z", initialNow: "2026-09-29T01:00:00Z",
    activityStart: "2026-10-01", activityEnd: "2026-10-01", ...overrides })
}
const bar = (tree = render()) => find<Parameters<typeof SurveyActionBar>[0]>(tree, SurveyActionBar)!
const fields = (tree = render()) => find<Parameters<typeof RoundFormFields>[0]>(tree, RoundFormFields)!
const cancel = (tree = render()) => find<Parameters<typeof CancelRegistrationButton>[0]>(tree, CancelRegistrationButton)!
function edit(answers = { note: "更新后的备注", choices: ["a", "b"] }) {
  const form = fields(); form.onChange({ ...form.value, customAnswers: answers })
}

describe("editing an existing activity registration", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime("2026-09-29T01:00:00Z")
    states = []; refs = []
    mocks.useState.mockImplementation((initial: unknown) => {
      const index = cursor++
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial
      return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value }]
    })
    mocks.useRef.mockImplementation((value: unknown) => { const index = refCursor++; return refs[index] ??= { current: value } })
    mocks.window.mockReturnValue("open"); mocks.submit.mockResolvedValue({ success: true })
  })
  afterEach(() => vi.useRealTimers())

  it("hides submission for an active registration with no questions while preserving cancellation", async () => {
    const tree = render({ config: normalizeRoundConfig(undefined), existing: { ...existing, custom_answers: {} } })
    const actions = bar(tree)
    expect(actions.hideSubmit).toBe(true)
    expect(find(SurveyActionBar(actions), Button)).toBeUndefined()
    expect(cancel(tree)).toMatchObject({ roundId: "round", disabled: false, expectedUpdatedAt: existing.updated_at })
    expect(fields(tree).registered).toBe(true)
    await actions.onSubmit()
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it("prefills saved answers, enables saving after editing and disables it again after reverting", async () => {
    expect(fields().value.customAnswers).toEqual(existing.custom_answers)
    expect(bar().disabled).toBe(true)
    edit(); expect(bar().disabled).toBe(false)
    edit(existing.custom_answers); expect(bar().disabled).toBe(true)
    await bar().onSubmit(); expect(mocks.submit).not.toHaveBeenCalled()
    edit(); await bar(render({ fromParticipation: true })).onSubmit()
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ registrationIntent: "update", expectedUpdatedAt: existing.updated_at,
      customAnswers: { note: "更新后的备注", choices: ["a", "b"] } }))
    expect(mocks.push).toHaveBeenCalledWith("/app/matching/survey/success?roundId=round&from=participation")
  })

  it("does not enable another save for whitespace or multi-choice order alone", async () => {
    edit({ note: "  原有备注\n", choices: ["b", "a"] })
    expect(bar().disabled).toBe(true)
    await bar().onSubmit(); expect(mocks.submit).not.toHaveBeenCalled()
  })

  it("locks saving during cancellation and locks cancellation and duplicate saves during saving", async () => {
    edit(); cancel().onBusyChange?.(true)
    expect(bar().disabled).toBe(true)
    await bar().onSubmit(); expect(mocks.submit).not.toHaveBeenCalled()
    cancel().onBusyChange?.(false)
    let finish!: (value: { success: true }) => void
    mocks.submit.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const first = bar().onSubmit()
    expect(bar().disabled).toBe(true); expect(cancel().disabled).toBe(true)
    await bar().onSubmit(); expect(mocks.submit).toHaveBeenCalledOnce()
    finish({ success: true }); await first
  })

  it("keeps edited answers but blocks saving and cancellation when the deadline is reached", async () => {
    edit(); mocks.window.mockReturnValue("expired")
    expect(bar().disabled).toBe(true); expect(cancel().disabled).toBe(true)
    expect(fields().value.customAnswers.note).toBe("更新后的备注")
    await bar().onSubmit(); expect(mocks.submit).not.toHaveBeenCalled()
  })

  it("requires a refresh after the server reports stale registration state", async () => {
    edit(); mocks.submit.mockResolvedValue({ error: "registrationChanged" })
    await bar().onSubmit()
    expect(bar()).toMatchObject({ disabled: true, error: "registrationChanged" })
    expect(cancel().disabled).toBe(true)
    await bar().onSubmit(); expect(mocks.submit).toHaveBeenCalledOnce()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it("preserves edits after a network failure and permits retry with the same saved version", async () => {
    edit(); mocks.submit.mockRejectedValueOnce(new Error("network"))
    await bar().onSubmit()
    expect(bar()).toMatchObject({ disabled: false, error: "networkError" })
    expect(fields().value.customAnswers.note).toBe("更新后的备注")
    await bar().onSubmit()
    expect(mocks.submit).toHaveBeenCalledTimes(2)
    expect(mocks.submit.mock.calls[0][0]).toEqual(mocks.submit.mock.calls[1][0])
    expect(mocks.push).toHaveBeenCalledOnce()
  })
})
