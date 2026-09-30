import { isValidElement, type ReactElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  useState: vi.fn(),
  useActionState: vi.fn(),
  setOpen: vi.fn(),
  signOut: vi.fn(),
  action: vi.fn(),
}))

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: mocks.useState,
  useActionState: mocks.useActionState,
  useTransition: () => [false, vi.fn()],
}))
vi.mock("next-intl", () => ({
  useLocale: () => "zh",
  useTranslations: () => (key: string) => key,
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/app/login/actions", () => ({ signOut: mocks.signOut }))
vi.mock("@/lib/i18n/actions", () => ({ setLocale: vi.fn() }))
vi.mock("@/components/player/LineBindingCard", () => ({ LineBindingCard: () => null }))

import { ProfileSettingsCard } from "./ProfileSettingsCard"

type ElementProps = {
  children?: ReactNode
  type?: string
  disabled?: boolean
  role?: string
  action?: unknown
  onClick?: () => void
  onSubmit?: unknown
}

function findElement(node: ReactNode, predicate: (element: ReactElement<ElementProps>) => boolean): ReactElement<ElementProps> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, predicate)
      if (found) return found
    }
  } else if (isValidElement<ElementProps>(node)) {
    if (predicate(node)) return node
    return findElement(node.props.children, predicate)
  }
}

function containsText(node: ReactNode, text: string): boolean {
  if (node === text) return true
  if (Array.isArray(node)) return node.some((child) => containsText(child, text))
  return isValidElement<ElementProps>(node) && containsText(node.props.children, text)
}

const labels = {
  language: "language", languageZh: "中文", languageJa: "日本語",
  logout: "退出登录", logoutConfirm: "确认退出当前账号吗？", logoutFailed: "退出失败，请重试",
}

function renderCard() {
  return ProfileSettingsCard({ lineUserId: null, labels })
}

describe("profile logout confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useState.mockReturnValue([false, mocks.setOpen])
    mocks.useActionState.mockReturnValue([null, mocks.action, false])
  })

  afterEach(() => { vi.unstubAllGlobals() })

  it("opens an in-page confirmation even when the browser suppresses native dialogs", () => {
    const confirm = vi.fn(() => false)
    vi.stubGlobal("window", { confirm })
    const trigger = findElement(renderCard(), (element) => element.type === "button" && containsText(element.props.children, labels.logout))

    expect(trigger?.props.type).toBe("button")
    trigger?.props.onClick?.()

    expect(mocks.setOpen).toHaveBeenCalledWith(true)
    expect(confirm).not.toHaveBeenCalled()
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(mocks.action).not.toHaveBeenCalled()
  })

  it("lets the user cancel without submitting a logout", () => {
    mocks.useState.mockReturnValue([true, mocks.setOpen])
    const cancel = findElement(renderCard(), (element) => element.type === "button" && containsText(element.props.children, "cancel"))

    expect(cancel?.props.type).toBe("button")
    cancel?.props.onClick?.()

    expect(mocks.setOpen).toHaveBeenCalledWith(false)
    expect(mocks.action).not.toHaveBeenCalled()
  })

  it("submits the confirmed logout without a second native dialog", () => {
    mocks.useState.mockReturnValue([true, mocks.setOpen])
    const form = findElement(renderCard(), (element) => element.type === "form")

    expect(mocks.useActionState).toHaveBeenCalledWith(mocks.signOut, null)
    expect(form?.props.action).toBe(mocks.action)
    expect(form?.props.onSubmit).toBeUndefined()
  })

  it("disables confirmation while logout is pending", () => {
    mocks.useState.mockReturnValue([true, mocks.setOpen])
    mocks.useActionState.mockReturnValue([null, mocks.action, true])
    const submit = findElement(renderCard(), (element) => element.type === "button" && element.props.type === "submit")

    expect(submit?.props.disabled).toBe(true)
    expect(containsText(submit?.props.children, "loading")).toBe(true)
  })

  it("shows logout failure and leaves confirmation available for retry", () => {
    mocks.useState.mockReturnValue([true, mocks.setOpen])
    mocks.useActionState.mockReturnValue([{ error: "logout_failed" }, mocks.action, false])
    const tree = renderCard()
    const alert = findElement(tree, (element) => element.props.role === "alert")
    const submit = findElement(tree, (element) => element.type === "button" && element.props.type === "submit")

    expect(containsText(alert?.props.children, labels.logoutFailed)).toBe(true)
    expect(submit?.props.disabled).toBe(false)
  })
})
