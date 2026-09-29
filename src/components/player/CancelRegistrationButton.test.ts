import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ cancel: vi.fn(), replace: vi.fn(), refresh: vi.fn(),
  useState: vi.fn(), useRef: vi.fn(), hasError: vi.fn() }))
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: mocks.useState, useRef: mocks.useRef }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }))
vi.mock("next-intl", () => ({ useTranslations: () => Object.assign((key: string) => key, { has: mocks.hasError }) }))
vi.mock("@/app/app/matching/survey/cancellation-actions", () => ({ cancelRegistration: mocks.cancel }))
import { CancelRegistrationButton } from "./CancelRegistrationButton"

type NodeProps = { children?: ReactNode; disabled?: boolean; onClick?: () => void | Promise<void>;
  open?: boolean; onOpenChange?: (open: boolean) => void; role?: string }
function find(node: ReactNode, predicate: (props: NodeProps) => boolean): NodeProps | undefined {
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean)
  if (!isValidElement<NodeProps>(node)) return
  return predicate(node.props) ? node.props : find(node.props.children, predicate)
}
let states: unknown[], refs: { current: unknown }[], stateCursor: number, refCursor: number
function render(overrides: Partial<Parameters<typeof CancelRegistrationButton>[0]> = {}) {
  stateCursor = 0; refCursor = 0
  return CancelRegistrationButton({ roundId: "round", roundName: "秋季迎新派对", expectedUpdatedAt: "revision", ...overrides })
}
function button(label: string, tree = render()) {
  const result = find(tree, (props) => props.children === label && Boolean(props.onClick))
  if (!result?.onClick) throw new Error(`Missing ${label} button`)
  return result as NodeProps & { onClick: () => void | Promise<void> }
}
function dialog(tree = render()) { return find(tree, (props) => Boolean(props.onOpenChange))! }

describe("registration cancellation confirmation", () => {
  beforeEach(() => {
    vi.resetAllMocks(); states = []; refs = []
    mocks.useState.mockImplementation((initial: unknown) => {
      const index = stateCursor++
      if (!(index in states)) states[index] = initial
      return [states[index], (value: unknown) => { states[index] = value }]
    })
    mocks.useRef.mockImplementation((initial: unknown) => {
      const index = refCursor++
      return refs[index] ?? (refs[index] = { current: initial })
    })
    mocks.cancel.mockResolvedValue({ success: true }); mocks.hasError.mockReturnValue(true)
  })

  it("opens a confirmation and lets the member keep their signup without sending a request", async () => {
    expect(dialog().open).toBe(false)
    await button("cancelRegistration").onClick()
    expect(dialog().open).toBe(true)
    expect(mocks.cancel).not.toHaveBeenCalled()
    await button("keepRegistration").onClick()
    expect(dialog().open).toBe(false)
    expect(mocks.cancel).not.toHaveBeenCalled()
  })

  it("refreshes the current detail only after confirmed cancellation succeeds", async () => {
    const onBusyChange = vi.fn()
    await button("cancelRegistration").onClick()
    await button("confirmCancel", render({ onBusyChange })).onClick()
    expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith({ roundId: "round", expectedUpdatedAt: "revision" })
    expect(mocks.refresh).toHaveBeenCalledOnce(); expect(mocks.replace).not.toHaveBeenCalled()
    expect(onBusyChange.mock.calls).toEqual([[true], [false]])
    expect(find(render(), (props) => props.role === "status")?.children).toBe("status.cancelled")
  })

  it("replaces the form with its preserved detail instead of refreshing a cancelled form", async () => {
    await button("cancelRegistration").onClick()
    await button("confirmCancel", render({ returnToRecord: true })).onClick()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/app/matches/rounds/round")
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it("keeps the dialog open on a server conflict and never navigates", async () => {
    mocks.cancel.mockResolvedValue({ error: "registrationChanged" })
    await button("cancelRegistration").onClick()
    await button("confirmCancel").onClick()
    expect(dialog().open).toBe(true)
    expect(find(render(), (props) => props.role === "alert")?.children).toBe("registrationChanged")
    expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("shows a safe fallback for unknown errors without exposing backend text", async () => {
    mocks.hasError.mockReturnValue(false); mocks.cancel.mockResolvedValue({ error: "internal query details" })
    await button("cancelRegistration").onClick(); await button("confirmCancel").onClick()
    expect(find(render(), (props) => props.role === "alert")?.children).toBe("saveFailed")
  })

  it("allows retry after a network failure", async () => {
    mocks.cancel.mockRejectedValueOnce(new Error("offline"))
    await button("cancelRegistration").onClick(); await button("confirmCancel").onClick()
    expect(find(render(), (props) => props.role === "alert")?.children).toBe("networkError")
    expect(button("confirmCancel").disabled).toBe(false)
    await button("confirmCancel").onClick()
    expect(mocks.cancel).toHaveBeenCalledTimes(2); expect(mocks.refresh).toHaveBeenCalledOnce()
  })

  it("ignores repeated clicks and prevents dismissing the dialog while a request is pending", async () => {
    let finish!: (value: { success: true }) => void
    mocks.cancel.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    await button("cancelRegistration").onClick()
    const confirm = button("confirmCancel"); const first = confirm.onClick()
    await confirm.onClick()
    expect(mocks.cancel).toHaveBeenCalledOnce()
    expect(button("cancelling").disabled).toBe(true)
    dialog().onOpenChange?.(false); expect(dialog().open).toBe(true)
    finish({ success: true }); await first
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })

  it("does not send a request when cancellation becomes disabled", async () => {
    await button("cancelRegistration").onClick()
    const confirm = button("confirmCancel", render({ disabled: true }))
    expect(confirm.disabled).toBe(true); await confirm.onClick()
    expect(mocks.cancel).not.toHaveBeenCalled()
  })
})
