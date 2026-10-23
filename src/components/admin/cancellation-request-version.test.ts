// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ approve: vi.fn(), reject: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock("@/app/admin/matching/cancellations/actions", () => ({ approveCancellation: mocks.approve, rejectCancellation: mocks.reject }))
import { CancellationList } from "./CancellationList"

let root: Root
const requestedAt = "2026-10-23T12:34:56.123456Z"
const request = { id: "result", cancellation_reason: "希望取消本次匹配", cancellation_requested_by: "member",
  cancellation_requested_at: requestedAt, cancellation_publication_version: 2,
  session: { session_name: "十月测试", publication_version: 3 },
  member_a: { member_identity: { full_name: "成员甲" } }, member_b: { member_identity: { full_name: "成员乙" } } }

describe("cancellation request version submitted by approval UI", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    document.body.innerHTML = '<div id="root"></div>'
    root = createRoot(document.getElementById("root")!)
    mocks.approve.mockResolvedValue({ error: "发布版本或审批状态已变化" })
    mocks.reject.mockResolvedValue({ success: true })
  })
  afterEach(async () => act(async () => root.unmount()))
  it.each([["同意取消", "approve"], ["驳回", "reject"]] as const)("%s submits the request owner, preserving its original timestamp", async (label, action) => {
    await act(async () => root.render(createElement(CancellationList, { requests: [request] })))
    const input = document.getElementById("cancellation-reason-result") as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "核实申请后操作")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label)!
    expect(button.disabled).toBe(false)
    await act(async () => button.click())
    expect(mocks[action]).toHaveBeenCalledWith("result", "核实申请后操作", 2, requestedAt)
    if (action === "approve") {
      expect(document.body.textContent).toContain("发布版本或审批状态已变化")
      expect(mocks.refresh).not.toHaveBeenCalled()
    } else expect(mocks.refresh).toHaveBeenCalledOnce()
  })
})
