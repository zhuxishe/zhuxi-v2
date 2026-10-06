import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { EMPTY_FORM } from "@/types"

const mocks = vi.hoisted(() => ({
  useState: vi.fn(),
  setStep: vi.fn(),
  setBusy: vi.fn(),
  setError: vi.fn(),
  save: vi.fn(),
  submit: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: mocks.useState,
  useMemo: (factory: () => unknown) => factory(),
  useRef: (value: unknown) => ({ current: value }),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}))
vi.mock("next-intl", () => ({
  useLocale: () => "zh",
  useTranslations: () => (key: string) => key,
}))
vi.mock("@/app/app/interview-form/actions", () => ({
  savePreInterviewStep: mocks.save,
  submitPreInterviewForm: mocks.submit,
}))
vi.mock("./InterviewStep2", () => ({ InterviewStep2: () => null }))

import { PreInterviewForm } from "./PreInterviewForm"

function buttonProps(node: ReactNode, text: string): { onClick?: () => Promise<void>; disabled?: boolean } | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const button = buttonProps(child, text)
      if (button) return button
    }
  } else if (isValidElement<{ children?: ReactNode; onClick?: () => Promise<void>; disabled?: boolean }>(node)) {
    if (node.props.children === text && node.props.onClick) return node.props
    return buttonProps(node.props.children, text)
  }
}

function formButton(step: 0 | 1 | 3, nickname = "", patch: Partial<typeof EMPTY_FORM> = {}) {
  mocks.useState
    .mockImplementationOnce((initial) => [initial, mocks.setStep])
    .mockImplementationOnce((initial) => [initial, vi.fn()])
    .mockImplementationOnce((initial) => [initial, mocks.setBusy])
    .mockImplementationOnce((initial) => [initial, vi.fn()])
    .mockImplementationOnce((initial) => [initial, mocks.setError])
  const form = PreInterviewForm({
    initialStep: step,
    defaultValues: {
      ...EMPTY_FORM,
      full_name: "测试玩家",
      nickname,
      gender: "female",
      age_range: "20-24",
      birth_date: "2003-07-15",
      school_name: "早稻田大学",
      degree_level: "修士",
      nationality: "中国",
      current_city: "东京",
      personality_self_tags: ["温和"],
      ...patch,
    },
  })
  const button = buttonProps(form, step === 3 ? "submit" : "next")
  if (!button?.onClick) throw new Error("Expected form action")
  return { onClick: button.onClick, disabled: button.disabled }
}

function formAction(step: 0 | 3) {
  return formButton(step).onClick
}

describe("onboarding request recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.save.mockResolvedValue({ success: true, lastSavedAt: "2026-09-08T01:00:00Z" })
    mocks.submit.mockResolvedValue({ success: true })
  })

  it.each([
    ["", false], ["　 ", false], ["寒", true], ["　寒　", true],
    ["😀", true], ["小寒", false], ["😀".repeat(20), false], ["寒".repeat(21), true],
  ])("gates the next button for nickname %j (disabled: %s)", (nickname, disabled) => {
    expect(formButton(0, nickname).disabled).toBe(disabled)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it.each([
    [0, { birth_date: "" }], [0, { birth_date: "2023-02-29" }],
    [1, { school_name: " " }], [1, { degree_level: "" }],
    [1, { degree_level: "invalid" }],
  ] as const)("blocks step %s with missing required data", async (step, patch) => {
    const button = formButton(step, "", patch)
    expect(button.disabled).toBe(true)
    await button.onClick()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("keeps the current draft and allows retry after a step transport failure", async () => {
    mocks.save.mockRejectedValueOnce(new Error("Failed to fetch"))
    const next = formAction(0)

    await next()
    expect(mocks.setError).toHaveBeenLastCalledWith("saveError")
    expect(mocks.setBusy).toHaveBeenLastCalledWith(null)
    expect(mocks.setStep).not.toHaveBeenCalled()

    await next()
    expect(mocks.save).toHaveBeenCalledTimes(2)
    expect(mocks.setStep).toHaveBeenCalledOnce()
  })

  it("does not submit when saving the final step fails", async () => {
    mocks.save.mockRejectedValueOnce(new Error("Failed to fetch"))
    await formAction(3)()
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.setBusy).toHaveBeenLastCalledWith(null)
    expect(mocks.setError).toHaveBeenLastCalledWith("saveError")
  })

  it("allows retry after final submission transport failure", async () => {
    mocks.submit.mockRejectedValueOnce(new Error("Failed to fetch"))
    const submit = formAction(3)

    await submit()
    expect(mocks.setError).toHaveBeenLastCalledWith("submitError")
    expect(mocks.setBusy).toHaveBeenLastCalledWith(null)
    expect(mocks.replace).not.toHaveBeenCalled()

    await submit()
    expect(mocks.replace).toHaveBeenCalledWith("/app")
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })

  it("ignores a second click while a save is still in flight", async () => {
    let finishSave!: (result: { success: boolean }) => void
    mocks.save.mockReturnValueOnce(new Promise((resolve) => { finishSave = resolve }))
    const next = formAction(0)
    const first = next()
    await next()
    expect(mocks.save).toHaveBeenCalledOnce()

    finishSave({ success: true })
    await first
    expect(mocks.setBusy).toHaveBeenLastCalledWith(null)
  })
})
