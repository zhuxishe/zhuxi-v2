// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ cancel: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock("@/app/app/matches/[id]/actions", () => ({ requestCancellation: mocks.cancel }))
import { CancelRequestForm } from "./CancelRequestForm"

const labels = {
  requestCancel: "申请取消匹配", cancelHelpLabel: "匹配帮助与取消申请",
  cancelHelpDescription: "无法参加时可提交取消申请，由工作人员审核。",
  cancelFormTitle: "提交取消申请", cancelReasonPlaceholder: "请填写取消原因（可选）",
  cancelBack: "返回", confirmCancel: "确认提交", submitting: "提交中...",
  publicationChanged: "发布版本已变更，输入已保留", saveFailed: "提交暂未完成，请稍后重试",
}
let root: Root
function trigger() { return document.querySelector<HTMLButtonElement>(`button[aria-label="${labels.cancelHelpLabel}"]`)! }
function dialog() { return document.querySelector<HTMLElement>('[role="dialog"]') }
function button(text: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === text)
  if (!found) throw new Error(`Missing button: ${text}`)
  return found
}
function textarea() { return document.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${labels.cancelReasonPlaceholder}"]`)! }
async function open() {
  await act(async () => { trigger().focus(); trigger().click() })
}
async function enterReason(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea(), value)
    textarea().dispatchEvent(new Event("input", { bubbles: true }))
  })
}
async function submit() {
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
}
async function close() {
  await act(async () => button(labels.cancelBack).click())
  await vi.waitFor(() => expect(dialog()).toBeNull())
}

beforeEach(async () => {
  vi.resetAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  document.body.innerHTML = '<div id="root"></div>'
  root = createRoot(document.getElementById("root")!)
  mocks.cancel.mockResolvedValue({ success: true })
  await act(async () => root.render(createElement(CancelRequestForm, { matchId: "result", publicationVersion: 2, labels })))
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.restoreAllMocks()
})

describe("quiet matching cancellation help", () => {
  it("opens an accessible dialog from the named icon without requesting cancellation", async () => {
    expect(trigger()).not.toBeNull()
    expect(trigger().textContent).not.toBe(labels.requestCancel)
    expect(dialog()).toBeNull()
    await open()
    expect(dialog()).not.toBeNull()
    expect(document.body.textContent).toContain(labels.cancelFormTitle)
    expect(document.body.textContent).toContain(labels.cancelHelpDescription)
    expect(textarea().maxLength).toBe(500)
    expect(mocks.cancel).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it("returns focus and preserves an unsubmitted reason when the user closes and reopens", async () => {
    await open(); await enterReason("先写下原因，但暂不提交")
    await close()
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger()))
    expect(mocks.cancel).not.toHaveBeenCalled()
    await open()
    expect(textarea().value).toBe("先写下原因，但暂不提交")
  })

  it("retains the reason and displayed publication version after a stale publication response", async () => {
    mocks.cancel.mockResolvedValue({ error: "publicationChanged" })
    await open(); await enterReason("保留我的取消原因"); await submit()
    const sent = mocks.cancel.mock.calls[0][0] as FormData
    expect(sent.get("matchId")).toBe("result")
    expect(sent.get("publicationVersion")).toBe("2")
    expect(sent.get("reason")).toBe("保留我的取消原因")
    expect(dialog()).not.toBeNull()
    expect(textarea().value).toBe("保留我的取消原因")
    expect(document.body.textContent).toContain(labels.publicationChanged)
    expect(button(labels.confirmCancel).disabled).toBe(false)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it("recovers from a network exception without losing input or leaving submit disabled", async () => {
    mocks.cancel.mockRejectedValueOnce(new Error("network unavailable")).mockResolvedValueOnce({ success: true })
    await open(); await enterReason("请保留这段输入"); await submit()
    expect(dialog()).not.toBeNull()
    expect(textarea().value).toBe("请保留这段输入")
    expect(document.body.textContent).toContain(labels.saveFailed)
    expect(document.body.textContent).not.toContain("network unavailable")
    expect(button(labels.confirmCancel).disabled).toBe(false)
    expect(mocks.refresh).not.toHaveBeenCalled()
    await submit()
    expect((mocks.cancel.mock.calls[1][0] as FormData).get("reason")).toBe("请保留这段输入")
    expect(mocks.refresh).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(dialog()).toBeNull())
  })

  it("blocks duplicate submissions and dismissal while a request is pending", async () => {
    let resolve!: (value: { error: string }) => void
    mocks.cancel.mockImplementation(() => new Promise((done) => { resolve = done }))
    await open(); await enterReason("正在等待提交结果")
    await act(async () => {
      const form = document.querySelector("form")!
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(mocks.cancel).toHaveBeenCalledOnce()
    expect(button(labels.submitting).disabled).toBe(true)
    expect(button(labels.cancelBack).disabled).toBe(true)
    await act(async () => {
      dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
      button(labels.cancelBack).click()
    })
    expect(dialog()).not.toBeNull()
    expect(mocks.refresh).not.toHaveBeenCalled()
    await act(async () => resolve({ error: "saveFailed" }))
    expect(button(labels.confirmCancel).disabled).toBe(false)
    expect(button(labels.cancelBack).disabled).toBe(false)
    expect(textarea().value).toBe("正在等待提交结果")
  })

  it("submits an optional empty reason only on confirmation and closes after success", async () => {
    await open()
    expect(mocks.cancel).not.toHaveBeenCalled()
    await submit()
    expect(mocks.cancel).toHaveBeenCalledOnce()
    const sent = mocks.cancel.mock.calls[0][0] as FormData
    expect(sent.get("reason")).toBe("")
    expect(sent.get("publicationVersion")).toBe("2")
    expect(mocks.refresh).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(dialog()).toBeNull())
  })
})
