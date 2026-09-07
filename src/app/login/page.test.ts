import { isValidElement, type FormEvent, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  useState: vi.fn(),
  setLoading: vi.fn(),
  setError: vi.fn(),
  setRegistered: vi.fn(),
  signUp: vi.fn(),
  signIn: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: mocks.useState,
  useEffect: vi.fn(),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}))
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("@/lib/app-launch-splash", () => ({ skipAppLaunchSplashOnce: vi.fn() }))
vi.mock("./actions", () => ({ signUp: mocks.signUp, signIn: mocks.signIn }))

import LoginPage from "./page"

function findSubmit(node: ReactNode): ((event: FormEvent) => Promise<void>) | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const submit = findSubmit(child)
      if (submit) return submit
    }
  } else if (isValidElement<{ children?: ReactNode; onSubmit?: (event: FormEvent) => Promise<void> }>(node)) {
    if (node.type === "form") return node.props.onSubmit
    return findSubmit(node.props.children)
  }
}

function submitForm(mode: "login" | "register") {
  mocks.useState
    .mockReturnValueOnce([mode, vi.fn()])
    .mockReturnValueOnce(["player@example.com", vi.fn()])
    .mockReturnValueOnce(["test-password", vi.fn()])
    .mockReturnValueOnce([false, mocks.setLoading])
    .mockReturnValueOnce([null, mocks.setError])
    .mockReturnValueOnce([false, mocks.setRegistered])
    .mockReturnValueOnce(["/app", vi.fn()])
  const submit = findSubmit(LoginPage())
  if (!submit) throw new Error("Expected login form")
  return submit({ preventDefault: vi.fn() } as unknown as FormEvent)
}

describe("login form completion and recovery", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("routes an immediately authenticated registration into the app", async () => {
    mocks.signUp.mockResolvedValue({ success: true, requiresEmailConfirmation: false })
    await submitForm("register")
    expect(mocks.replace).toHaveBeenCalledWith("/app")
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.setRegistered).not.toHaveBeenCalled()
    expect(mocks.setLoading).toHaveBeenLastCalledWith(false)
  })

  it("shows the email confirmation notice until a session is available", async () => {
    mocks.signUp.mockResolvedValue({ success: true, requiresEmailConfirmation: true })
    await submitForm("register")
    expect(mocks.setRegistered).toHaveBeenCalledWith(true)
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.setLoading).toHaveBeenLastCalledWith(false)
  })

  it.each(["login", "register"] as const)("restores the %s form after a transport failure", async (mode) => {
    mocks.signUp.mockRejectedValue(new Error("Failed to fetch"))
    mocks.signIn.mockRejectedValue(new Error("Failed to fetch"))
    await submitForm(mode)
    expect(mocks.setError).toHaveBeenLastCalledWith(mode === "register" ? "signupFailed" : "loginError")
    expect(mocks.setLoading).toHaveBeenLastCalledWith(false)
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
