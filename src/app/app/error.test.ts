import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(), reset: vi.fn(), startTransition: vi.fn(), useTransition: vi.fn(),
}))
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useTransition: mocks.useTransition,
}))

import AppError from "./error"

interface RetryButtonProps { children?: ReactNode; onClick?: () => void; disabled?: boolean; "aria-busy"?: boolean }

function retryButton(node: ReactNode): RetryButtonProps | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const button = retryButton(child)
      if (button) return button
    }
  } else if (isValidElement<RetryButtonProps>(node)) {
    if (node.props.children === "retry" && node.props.onClick) return node.props
    return retryButton(node.props.children)
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.startTransition.mockImplementation((callback: () => void) => callback())
  mocks.useTransition.mockReturnValue([false, mocks.startTransition])
})

describe("player error recovery", () => {
  it("requests fresh server data before resetting the boundary in one transition", () => {
    const order: string[] = []
    mocks.refresh.mockImplementation(() => { order.push("refresh") })
    mocks.reset.mockImplementation(() => { order.push("reset") })
    const button = retryButton(AppError({ error: new Error("temporary auth outage"), reset: mocks.reset }))

    expect(button?.disabled).toBe(false)
    button?.onClick?.()

    expect(mocks.startTransition).toHaveBeenCalledOnce()
    expect(order).toEqual(["refresh", "reset"])
  })

  it("disables retry and prevents another refresh while the transition is pending", () => {
    mocks.useTransition.mockReturnValue([true, mocks.startTransition])
    const button = retryButton(AppError({ error: new Error("temporary auth outage"), reset: mocks.reset }))

    expect(button?.disabled).toBe(true)
    expect(button?.["aria-busy"]).toBe(true)
    button?.onClick?.()
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(mocks.reset).not.toHaveBeenCalled()
  })
})
