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

function renderForm(mode: "login" | "register", nextPath = "/app", sessionExpired = false) {
  mocks.useState
    .mockReturnValueOnce([mode, vi.fn()])
    .mockReturnValueOnce(["player@example.com", vi.fn()])
    .mockReturnValueOnce(["test-password", vi.fn()])
    .mockReturnValueOnce([false, mocks.setLoading])
    .mockReturnValueOnce([null, mocks.setError])
    .mockReturnValueOnce([false, mocks.setRegistered])
    .mockReturnValueOnce([nextPath, vi.fn()])
    .mockReturnValueOnce([sessionExpired, vi.fn()])
  return LoginPage()
}

function submitForm(mode: "login" | "register", nextPath = "/app") {
  const submit = findSubmit(renderForm(mode, nextPath))
  if (!submit) throw new Error("Expected login form")
  return submit({ preventDefault: vi.fn() } as unknown as FormEvent)
}

describe("login form completion and recovery", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("shows a concise expiry notice in the existing subtitle location without changing the form", () => {
    function status(node: ReactNode): ReactNode {
      if (Array.isArray(node)) return node.map(status).find(Boolean)
      if (!isValidElement<{ children?: ReactNode; role?: string }>(node)) return null
      return node.props.role === "status" ? node.props.children : status(node.props.children)
    }
    const tree = renderForm("login", "/app/matching/survey?round=kept", true)
    expect(status(tree)).toBe("sessionExpired")
    expect(findSubmit(tree)).toBeTypeOf("function")
    expect(mocks.signIn).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

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

  it.each([
    "/app/matching/survey?round=round-id&from=participation",
    "/app/matches/rounds/round-id?from=notification",
    "/app/matches/result-id",
  ])("returns password login to the original page without submitting its form: %s", async (next) => {
    mocks.signIn.mockResolvedValue({ success: true })
    await submitForm("login", next)
    expect(mocks.replace).toHaveBeenCalledWith(next)
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.signUp).not.toHaveBeenCalled()
  })

  it.each(["//example.com", "/application", "/app/%2e%2e/admin", "/app/\\../admin"])(
    "revalidates the password return destination: %s", async (next) => {
      mocks.signIn.mockResolvedValue({ success: true })
      await submitForm("login", next)
      expect(mocks.replace).toHaveBeenCalledWith("/app")
    },
  )

  it.each(["login", "register"] as const)("restores the %s form after a transport failure", async (mode) => {
    mocks.signUp.mockRejectedValue(new Error("Failed to fetch"))
    mocks.signIn.mockRejectedValue(new Error("Failed to fetch"))
    await submitForm(mode)
    expect(mocks.setError).toHaveBeenLastCalledWith(mode === "register" ? "signupFailed" : "loginError")
    expect(mocks.setLoading).toHaveBeenLastCalledWith(false)
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
