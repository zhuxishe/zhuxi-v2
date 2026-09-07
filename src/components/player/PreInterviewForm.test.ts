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

function buttonAction(node: ReactNode, text: string): (() => Promise<void>) | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const action = buttonAction(child, text)
      if (action) return action
    }
  } else if (isValidElement<{ children?: ReactNode; onClick?: () => Promise<void> }>(node)) {
    if (node.props.children === text && node.props.onClick) return node.props.onClick
    return buttonAction(node.props.children, text)
  }
}

function formAction(step: 0 | 3) {
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
      age_range: "20-24",
      nationality: "中国",
      current_city: "东京",
      personality_self_tags: ["温和"],
    },
  })
  const action = buttonAction(form, step === 3 ? "submit" : "next")
  if (!action) throw new Error("Expected form action")
  return action
}

describe("onboarding request recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.save.mockResolvedValue({ success: true, lastSavedAt: "2026-09-08T01:00:00Z" })
    mocks.submit.mockResolvedValue({ success: true })
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
