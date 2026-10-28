// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { RoundAudienceSnapshot } from "@/lib/matching/round-audience-types"

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock("@/app/admin/matching/rounds/[id]/audience-actions", () => ({ loadRoundAudience: mocks.load, saveRoundAudience: mocks.save }))
import { RoundAudiencePanel } from "./RoundAudiencePanel"

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const ROUND = id(100)
const REASON = "按本期测试安排调整参与范围"
type SaveInput = { roundId: string; enabled: boolean; memberIds: string[]; expectedRevision: string; operationId: string; reason: string }
function fixture(): RoundAudienceSnapshot {
  return {
    roundId: ROUND, roundName: "示例秋季测试", isTest: true, purpose: "matching", status: "open", canManage: true,
    enabled: true, revision: "audience-revision-1", counts: { listed: 4, effective: 5, formal: 4, test: 1 }, operations: [],
    members: [
      { id: id(1), name: "林晓", memberNumber: "ZXS_301", isTest: false, listed: true, participated: true, eligible: true },
      { id: id(2), name: "陈语", memberNumber: "ZXS_302", isTest: false, listed: true, participated: false, eligible: true },
      { id: id(3), name: "测试月一", memberNumber: "TST_001", isTest: true, listed: true, participated: true, eligible: true },
      { id: id(4), name: "周宁", memberNumber: "ZXS_303", isTest: false, listed: false, participated: true, eligible: true },
      { id: id(5), name: "顾遥", memberNumber: "ZXS_304", isTest: false, listed: false, participated: false, eligible: true },
      { id: id(6), name: "已停用示例", memberNumber: "ZXS_305", isTest: false, listed: true, participated: false, eligible: false },
    ],
  }
}
let root: Root
let authority: RoundAudienceSnapshot
function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((el) => el.getAttribute("aria-label") === label || el.textContent?.trim() === label)
}
async function click(label: string) {
  const target = button(label)
  if (!target) throw new Error(`Missing button: ${label}`)
  await act(async () => target.click())
}
function checkbox(name: string) {
  return [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((el) => el.getAttribute("aria-label")?.includes(name))
}
async function toggle(name: string) {
  const target = checkbox(name)
  if (!target) throw new Error(`Missing member: ${name}`)
  await act(async () => target.click())
}
function field(label: string) {
  const aria = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)
  if (aria) return aria
  const owner = [...document.querySelectorAll<HTMLLabelElement>("label")].find((el) => el.textContent?.includes(label))
  return owner?.htmlFor ? document.getElementById(owner.htmlFor) as HTMLInputElement | HTMLTextAreaElement : owner?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input,textarea")
}
async function fill(label: string, value: string) {
  const target = field(label)
  if (!target) throw new Error(`Missing input: ${label}`)
  await act(async () => {
    const proto = target.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(target, value)
    target.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
async function mode(label: string) {
  const owner = [...document.querySelectorAll<HTMLLabelElement>("label")].find((el) => el.textContent?.includes(label) && el.querySelector('input[type="radio"]'))
  const target = owner?.querySelector<HTMLInputElement>('input[type="radio"]') ?? document.querySelector<HTMLElement>(`[role="radio"][aria-label="${label}"]`)
  if (!target) throw new Error(`Missing mode: ${label}`)
  await act(async () => target.click())
}
async function render(initial: RoundAudienceSnapshot | null = authority) {
  await act(async () => root.render(createElement(RoundAudiencePanel, { roundId: ROUND, initial })))
}
async function open() { await click("管理参与范围") }
function storedRequests() {
  return Object.keys(sessionStorage).flatMap((key) => {
    try { return [{ key, data: JSON.parse(sessionStorage.getItem(key)!) }] } catch { return [] }
  })
}
function applySaved(request: SaveInput) {
  authority = { ...authority, enabled: request.enabled, revision: "audience-revision-saved", members: authority.members.map((member) => ({ ...member, listed: request.memberIds.includes(member.id) })), counts: { ...authority.counts, listed: request.memberIds.length } }
}
beforeEach(() => {
  vi.resetAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  sessionStorage.clear()
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: false, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })))
  document.body.innerHTML = '<div id="root"></div>'
  root = createRoot(document.getElementById("root")!)
  authority = fixture()
  mocks.load.mockImplementation(async () => structuredClone(authority))
  mocks.save.mockImplementation(async (request: SaveInput) => { applySaved(request); return { success: true, operationId: request.operationId } })
  vi.spyOn(window, "confirm").mockReturnValue(true)
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear()
})

describe("round audience management", () => {
  it("shows the saved scope and activity type without changing anything when opened", async () => {
    await render()
    expect(document.body.textContent).toContain("参与范围")
    expect(document.body.textContent).toContain("测试活动")
    expect(document.body.textContent).toContain("所有正常正式玩家")
    await open()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.body.textContent).toContain("ZXS_301")
    expect(document.body.textContent).toContain("TST_001")
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("allows ordinary administrators to view the list but not edit scope or save", async () => {
    authority = { ...authority, canManage: false, members: authority.members.filter((member) => member.listed || member.participated) }
    await render()
    expect(button("管理参与范围")).toBeUndefined()
    await click("查看名单")
    expect(document.body.textContent).toContain("林晓")
    expect(document.body.textContent).toContain("仅超级管理员")
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("周宁")
    expect(button("保存参与范围")).toBeUndefined()
    expect([...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"],input[type="radio"]')].every((control) => control.disabled)).toBe(true)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("presents a formal round as a fixed normal-player scope without a conversion control", async () => {
    authority = { ...authority, isTest: false, canManage: false, members: [], counts: { listed: 0, effective: 20, formal: 20, test: 0 } }
    await render()
    expect(document.body.textContent).toContain("正式活动")
    expect(document.body.textContent).toContain("正常正式玩家")
    expect(button("管理参与范围")).toBeUndefined()
    expect(document.querySelector('input[type="radio"],select')).toBeNull()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("does not pretend an unavailable snapshot is an allowlist or open-to-all configuration", async () => {
    await render(null)
    expect(document.body.textContent).toMatch(/无法|未能|暂不可/)
    expect(button("管理参与范围")).toBeUndefined()
    expect(document.querySelector('input[type="checkbox"],input[type="radio"]')).toBeNull()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("keeps selection changes local and requires a meaningful reason before saving", async () => {
    await render(); await open(); await toggle("顾遥")
    expect(mocks.save).not.toHaveBeenCalled()
    expect(button("保存参与范围")?.disabled).toBe(true)
    await fill("修改原因", "调整")
    expect(button("保存参与范围")?.disabled).toBe(true)
    await fill("修改原因", REASON)
    expect(button("保存参与范围")?.disabled).toBe(false)
    await click("保存参与范围")
    const payload = mocks.save.mock.calls[0][0] as SaveInput
    expect(payload).toMatchObject({ roundId: ROUND, enabled: true, expectedRevision: "audience-revision-1", reason: REASON })
    expect(payload.memberIds).toContain(id(5))
    expect(payload.operationId).toMatch(/^[0-9a-f-]{36}$/)
    expect(mocks.load).toHaveBeenCalledWith(ROUND)
  })

  it("protects listed participants from removal while allowing unused list entries to change", async () => {
    await render(); await open()
    expect(checkbox("林晓")?.disabled).toBe(true)
    expect(checkbox("测试月一")?.disabled).toBe(true)
    expect(checkbox("陈语")?.disabled).toBe(false)
    await toggle("林晓"); await toggle("陈语"); await fill("修改原因", REASON); await click("保存参与范围")
    const payload = mocks.save.mock.calls[0][0] as SaveInput
    expect(payload.memberIds).toContain(id(1))
    expect(payload.memberIds).toContain(id(3))
    expect(payload.memberIds).not.toContain(id(2))
  })

  it("requires off-list existing participants to be retained before switching to an allowlist", async () => {
    await render(); await open(); await mode("指定名单"); await fill("修改原因", REASON)
    expect(button("保存参与范围")?.disabled).toBe(true)
    expect(button("保留已参与者")).toBeDefined()
    await click("保留已参与者")
    expect(checkbox("周宁")?.checked).toBe(true)
    await click("保存参与范围")
    const payload = mocks.save.mock.calls[0][0] as SaveInput
    expect(payload.enabled).toBe(false)
    expect(payload.memberIds).toEqual(expect.arrayContaining([id(1), id(3), id(4)]))
  })

  it("preserves selections hidden by name or member-number search", async () => {
    await render(); await open(); await toggle("顾遥")
    await fill("搜索名单", "TST_001")
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("测试月一")
    await fill("修改原因", REASON); await click("保存参与范围")
    expect((mocks.save.mock.calls[0][0] as SaveInput).memberIds).toEqual(expect.arrayContaining([id(1), id(2), id(3), id(5), id(6)]))
  })

  it("keeps edits and the reason after a definite concurrency rejection", async () => {
    mocks.save.mockResolvedValue({ error: "参与范围或活动状态已变化，请重新读取后再保存。" })
    await render(); await open(); await toggle("顾遥"); await fill("修改原因", REASON); await click("保存参与范围")
    expect(document.body.textContent).toContain("参与范围或活动状态已变化")
    expect(checkbox("顾遥")?.checked).toBe(true)
    expect(field("修改原因")?.value).toBe(REASON)
    expect(mocks.load).not.toHaveBeenCalled()
  })

  it("recovers an unknown outcome with the identical operation and payload instead of sending a second change", async () => {
    mocks.save.mockImplementationOnce(async (request: SaveInput) => { applySaved(request); return { unknown: true, operationId: request.operationId, error: "保存结果待确认" } })
    await render(); await open(); await toggle("顾遥"); await fill("修改原因", REASON); await click("保存参与范围")
    const original = structuredClone(mocks.save.mock.calls[0][0]) as SaveInput
    expect(storedRequests().some((entry) => JSON.stringify(entry.data) === JSON.stringify(original))).toBe(true)
    expect(checkbox("陈语")?.disabled).toBe(true)
    expect(field("修改原因")?.disabled).toBe(true)
    await click("核对上次保存")
    expect(mocks.save.mock.calls[1][0]).toEqual(original)
    expect(storedRequests().some((entry) => entry.data.operationId === original.operationId)).toBe(false)
  })

  it("preserves the original operation after a thrown network interruption", async () => {
    mocks.save.mockRejectedValueOnce(new Error("network interruption"))
    await render(); await open(); await toggle("顾遥"); await fill("修改原因", REASON); await click("保存参与范围")
    const original = structuredClone(mocks.save.mock.calls[0][0])
    await click("核对上次保存")
    expect(mocks.save.mock.calls[1][0]).toEqual(original)
  })

  it("can recover the original request after save succeeded but reading the fresh snapshot failed", async () => {
    mocks.load.mockRejectedValueOnce(new Error("reload unavailable"))
    await render(); await open(); await toggle("顾遥"); await fill("修改原因", REASON); await click("保存参与范围")
    const original = structuredClone(mocks.save.mock.calls[0][0])
    expect(storedRequests().some((entry) => entry.data.operationId === original.operationId)).toBe(true)
    await click("核对上次保存")
    expect(mocks.save.mock.calls[1][0]).toEqual(original)
    expect(storedRequests().some((entry) => entry.data.operationId === original.operationId)).toBe(false)
  })

  it("lets the administrator cancel a close request, or discard local edits without saving", async () => {
    await render(); await open(); await toggle("顾遥"); await fill("修改原因", REASON)
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await click("关闭参与范围")
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(checkbox("顾遥")?.checked).toBe(true)
    vi.mocked(window.confirm).mockReturnValueOnce(true)
    await click("关闭参与范围")
    await open()
    expect(checkbox("顾遥")?.checked).toBe(false)
    expect(field("修改原因")?.value).toBe("")
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("does not let an unknown outcome be discarded by closing the dialog", async () => {
    mocks.save.mockResolvedValue({ unknown: true, error: "保存结果待确认" })
    await render(); await open(); await toggle("顾遥"); await fill("修改原因", REASON); await click("保存参与范围")
    expect(button("关闭参与范围")?.disabled).toBe(true)
    await click("关闭参与范围")
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(window.confirm).not.toHaveBeenCalled()
    const leave = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(leave)
    expect(leave.defaultPrevented).toBe(true)
  })

  it("recovers stored requests after a remount even when the initial snapshot is unavailable", async () => {
    mocks.save.mockImplementationOnce(async (request: SaveInput) => { applySaved(request); return { unknown: true, operationId: request.operationId, error: "响应中断" } })
    await render(); await open(); await toggle("顾遥"); await fill("修改原因", REASON); await click("保存参与范围")
    const original = structuredClone(mocks.save.mock.calls[0][0])
    await act(async () => root.unmount())
    document.body.innerHTML = '<div id="root"></div>'; root = createRoot(document.getElementById("root")!)
    await render(null)
    expect(button("核对上次保存")?.disabled).toBe(false)
    await click("核对上次保存")
    expect(mocks.save.mock.calls[1][0]).toEqual(original)
    expect(storedRequests().some((entry) => entry.data.operationId === original.operationId)).toBe(false)
    const leave = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(leave)
    expect(leave.defaultPrevented).toBe(false)
  })

  it("sends only one operation during a double click and prevents edits while it is in flight", async () => {
    let finish: (() => void) | undefined
    mocks.save.mockImplementationOnce((request: SaveInput) => new Promise((resolve) => { finish = () => { applySaved(request); resolve({ success: true, operationId: request.operationId }) } }))
    await render(); await open(); await toggle("顾遥"); await fill("修改原因", REASON)
    const save = button("保存参与范围")!
    await act(async () => { save.click(); save.click() })
    expect(mocks.save).toHaveBeenCalledTimes(1)
    expect(checkbox("陈语")?.disabled).toBe(true)
    expect(field("修改原因")?.disabled).toBe(true)
    await act(async () => finish!())
    expect(mocks.load).toHaveBeenCalledTimes(1)
  })


  it("allows an unsaved removal of an existing inactive member to be reversed", async () => {
    await render(); await open(); await toggle("已停用示例")
    expect(checkbox("已停用示例")?.checked).toBe(false)
    expect(checkbox("已停用示例")?.disabled).toBe(false)
    await toggle("已停用示例")
    expect(checkbox("已停用示例")?.checked).toBe(true)
    expect(button("保存参与范围")?.disabled).toBe(true)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("reloads an unavailable snapshot without changing the participation scope", async () => {
    await render(null)
    await click("重新读取")
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(ROUND)
    expect(button("管理参与范围")).toBeDefined()
    expect(document.body.textContent).toContain("所有正常正式玩家")
    expect(mocks.save).not.toHaveBeenCalled()
  })

})
