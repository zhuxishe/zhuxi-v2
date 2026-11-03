// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MatchingBoardManualGroup, type ManualGroupMember } from "./MatchingBoardManualGroup"

let root: Root
const ids = ["a", "b", "c", "d", "e", "f", "g"]
const members: ManualGroupMember[] = ids.map((id, index) => ({ id, name: `玩家${id}`, source: index < 4 ? "multi" : "unmatched" }))
const prefs = Object.fromEntries(ids.map((id) => [id, { availability: { "2026-11-05": ["下午", "晚上"], "2026-11-12": ["上午"] } }]))
const onConfirm = vi.fn(), onClose = vi.fn()
function confirm() { return [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "确认新小组")! }
async function render(overrides: Partial<Parameters<typeof MatchingBoardManualGroup>[0]> = {}) {
  await act(async () => root.render(createElement(MatchingBoardManualGroup, { groupKind: "small", members, prefs, disabled: false, onConfirm, onClose, ...overrides })))
}
async function select(people: string[]) {
  for (const id of people) await act(async () => document.querySelector<HTMLInputElement>(`[aria-label="手动分组选择 玩家${id}"]`)!.click())
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal("matchMedia", vi.fn((media) => ({ matches: false, media, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  document.body.innerHTML = '<div id="root"></div>'
  root = createRoot(document.getElementById("root")!); onConfirm.mockReset(); onClose.mockReset()
})
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals() })

describe("manual multiplayer group creation", () => {
  it("selects people from both sources first, then lists all shared slots independently of the upper pool time", async () => {
    await render(); expect(confirm().disabled).toBe(true)
    await select(["a", "b", "e"])
    const slots = document.querySelector<HTMLSelectElement>('[aria-label="手动分组推荐时间"]')!
    expect([...slots.options].map((option) => option.value)).toEqual(["2026-11-05_下午", "2026-11-05_晚上", "2026-11-12_上午"])
    await act(async () => { slots.value = "2026-11-12_上午"; slots.dispatchEvent(new Event("change", { bubbles: true })) })
    await act(async () => confirm().click())
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith("2026-11-12_上午", ["a", "b", "e"])
  })
  it("permits a manually chosen seven-person group with a visible recommendation warning", async () => {
    await render(); await select(ids)
    expect(document.body.textContent).toContain("当前 7 人，超出系统推荐的4–6人范围")
    expect(confirm().disabled).toBe(false)
    await act(async () => confirm().click())
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith("2026-11-05_下午", ids)
  })
  it("blocks members with no shared date-and-period and never submits a guessed time", async () => {
    await render({ prefs: { ...prefs, c: { availability: { "2026-11-15": ["下午"] } } } }); await select(["a", "b", "c"])
    expect(confirm().disabled).toBe(true)
    expect(document.body.textContent).toContain("没有全员共同时间")
    expect(onConfirm).not.toHaveBeenCalled()
  })
  it("recomputes shared slots and replaces a no-longer-shared recommendation after selection changes", async () => {
    await render({ prefs: { ...prefs, d: { availability: { "2026-11-05": ["晚上"] } } } }); await select(["a", "b", "c", "d"])
    const slots = document.querySelector<HTMLSelectElement>('[aria-label="手动分组推荐时间"]')!
    expect([...slots.options].map((option) => option.value)).toEqual(["2026-11-05_晚上"])
    await act(async () => confirm().click())
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith("2026-11-05_晚上", ["a", "b", "c", "d"])
  })
  it("preserves selection and shows the server reason without assigning anyone", async () => {
    await render(); await select(["a", "b", "c"])
    await render({ error: "这些成员不满足匹配条件。" })
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("这些成员不满足匹配条件。")
    expect(document.querySelector<HTMLInputElement>('[aria-label="手动分组选择 玩家a"]')!.checked).toBe(true)
    expect(onConfirm).not.toHaveBeenCalled()
  })
  it("keeps locked or duo-only people unselectable and disables controls while verifying", async () => {
    await render({ members: [...members, { id: "duo", name: "仅双人玩家", source: "unmatched", disabledReason: "仅参加双人" }] })
    expect(document.querySelector<HTMLInputElement>('[aria-label="手动分组选择 仅双人玩家"]')!.disabled).toBe(true)
    await select(["a", "b", "c"])
    await render({ disabled: true })
    expect(document.querySelector<HTMLSelectElement>('[aria-label="手动分组推荐时间"]')!.disabled).toBe(true)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
