// @vitest-environment jsdom
import { act, createElement, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MatchingBoardUnmatchedMessage, type UnmatchedMessageMember } from "./MatchingBoardUnmatchedMessage"

let root: Root
const members: UnmatchedMessageMember[] = [{ id: "a", name: "示例甲", memberNumber: "ZXS_001" }, { id: "b", name: "示例乙", memberNumber: "ZXS_002" }, { id: "c", name: "示例丙", memberNumber: "ZXS_003" }]
const changed = vi.fn()
function Editor({ people = members, editable = true, common = "后续请留意通知。", initial = {} }: { people?: UnmatchedMessageMember[]; editable?: boolean; common?: string; initial?: Record<string, string | null> }) {
  const [value, setValue] = useState(common)
  const [personal, setPersonal] = useState(initial)
  return createElement(MatchingBoardUnmatchedMessage, { value, members: people, memberMessages: personal, editable, recipients: people.length, waitingDuo: 0, onChange: (next) => { setValue(next); changed() }, onMemberMessagesChange: (next) => { setPersonal(next); changed(next) }, onBlur: () => {} })
}
function select(name: string) { return document.querySelector<HTMLSelectElement>(`[aria-label="给 ${name}的留言方式"]`)! }
async function mode(name: string, value: string) { const field = select(name); await act(async () => { field.value = value; field.dispatchEvent(new Event("change", { bubbles: true })) }) }
async function write(name: string, value: string) { const field = document.querySelector<HTMLTextAreaElement>(`[aria-label="给 ${name}的个人留言"]`)!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })) }) }
function preview(name: string) { return document.querySelector<HTMLElement>(`[aria-label="${name}最终留言预览"]`)!.textContent! }
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); changed.mockClear(); document.body.innerHTML = '<div id="root"></div>'; root = createRoot(document.getElementById("root")!) })
afterEach(async () => { await act(async () => root.unmount()) })

describe("per-player unmatched staff messages", () => {
  it("does not change a draft when reading the default common fallback", async () => {
    await act(async () => root.render(createElement(Editor)))
    expect(preview("示例甲")).toContain("后续请留意通知。")
    expect(select("示例甲").value).toBe("common")
    expect(changed).not.toHaveBeenCalled()
  })
  it("keeps each personal message separate, with common fallback and explicit suppression", async () => {
    await act(async () => root.render(createElement(Editor)))
    await mode("示例甲", "personal"); await write("示例甲", "甲的共同时间较少。")
    await mode("示例乙", "personal"); await write("示例乙", "乙等待后续安排。")
    expect(preview("示例甲")).toContain("甲的共同时间较少。")
    expect(preview("示例甲")).not.toContain("乙等待后续安排。")
    expect(preview("示例乙")).not.toContain("甲的共同时间较少。")
    expect(preview("示例丙")).toContain("后续请留意通知。")
    await mode("示例甲", "none")
    expect(preview("示例甲")).toContain("不显示工作人员留言区域")
    expect(preview("示例甲")).not.toContain("后续请留意通知。")
    expect(changed.mock.calls.at(-1)![0]).toMatchObject({ a: null, b: "乙等待后续安排。" })
    await mode("示例甲", "common")
    expect(preview("示例甲")).toContain("后续请留意通知。")
    expect(changed.mock.calls.at(-1)![0]).not.toHaveProperty("a")
  })
  it("shows fallback for an empty personal message and validates Unicode without crashing", async () => {
    await act(async () => root.render(createElement(Editor)))
    await mode("示例甲", "personal")
    expect(preview("示例甲")).toContain("统一留言")
    await write("示例甲", "🌿".repeat(300))
    expect(document.querySelector('[aria-label="给 示例甲的个人留言"]')?.getAttribute("aria-invalid")).toBeNull()
    await write("示例甲", "字".repeat(301))
    expect(document.body.textContent).toContain("示例甲的个人留言最多300字")
    expect(preview("示例甲")).toContain("请缩短")
    await write("示例甲", "  ")
    expect(preview("示例甲")).toContain("后续请留意通知。")
  })
  it("paginates large rosters and searches by member number without discarding hidden drafts", async () => {
    const people = Array.from({ length: 100 }, (_, index) => ({ id: `p${index}`, name: `示例${index}`, memberNumber: `ZXS_${index}` }))
    await act(async () => root.render(createElement(Editor, { people, initial: { p99: "个人说明", assigned: null } })))
    expect(document.querySelectorAll("[data-member-message-id]")).toHaveLength(10)
    const more = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === "再显示10人")!
    await act(async () => more.click())
    expect(document.querySelectorAll("[data-member-message-id]")).toHaveLength(20)
    const search = document.querySelector<HTMLInputElement>('[aria-label="搜索个人留言成员"]')!
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "ZXS_99"); search.dispatchEvent(new Event("input", { bubbles: true })) })
    expect(document.querySelectorAll("[data-member-message-id]")).toHaveLength(1)
    expect(preview("示例99")).toContain("个人说明")
    expect(document.body.textContent).toContain("另有 1 位已安排成员保留个人设置")
    expect(changed).not.toHaveBeenCalled()
  })
  it("makes every message control read-only after publication or while operations are pending", async () => {
    await act(async () => root.render(createElement(Editor, { editable: false, initial: { a: "甲的说明", b: null } })))
    expect([...document.querySelectorAll<HTMLTextAreaElement | HTMLSelectElement>("textarea, select")].every((element) => element.disabled)).toBe(true)
    expect(preview("示例甲")).toContain("甲的说明")
    expect(preview("示例乙")).toContain("不显示工作人员留言区域")
    expect(changed).not.toHaveBeenCalled()
  })
})
