// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MatchingBoardSmallGroups, type MatchingBoardSmallGroupsProps } from "./MatchingBoardSmallGroups"

const SLOT = "2026-11-02_下午"
const ids = ["A", "B", "C", "D", "E", "F", "G"]
const availability = { "2026-11-01": ["上午", "下午", "晚上"], "2026-11-02": ["下午"], "2026-11-03": ["晚上"] }
let root: Root
let props: MatchingBoardSmallGroupsProps
const text = () => document.body.textContent ?? ""
function button(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.getAttribute("aria-label") === label || item.textContent?.trim() === label)
  if (!found) throw new Error(`Button not found: ${label}`)
  return found
}
async function render(overrides: Partial<MatchingBoardSmallGroupsProps> = {}) {
  props = { ...props, ...overrides }
  await act(async () => root.render(createElement(MatchingBoardSmallGroups, props)))
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  document.body.innerHTML = '<div id="root"></div>'
  root = createRoot(document.getElementById("root")!)
  props = {
    groups: [], recommendations: [{ key: "rec-1", memberIds: ids.slice(0, 4), bestSlot: SLOT, commonSlots: [] }],
    prefs: Object.fromEntries(ids.map((id) => [id, { availability }])), canViewTimes: true, canRecommend: true,
    editable: true, poolLocked: false, loading: false, loaded: true, waitingCount: 7, over: null,
    visible: () => true, name: (id) => `示例${id}`,
    chip: (id, instance, candidate) => createElement("button", { "data-member-id": id, "data-instance": instance, "data-candidate": !!candidate }, `示例${id}`),
    onRefresh: vi.fn(), onConfirm: vi.fn(), onRemoveMember: vi.fn(), locked: () => false, lockDisabled: false, onLock: vi.fn(),
  }
})
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks() })

describe("4–6 person grouping section", () => {
  it("shows every current shared slot and highlights the recommendation", async () => {
    await render()
    const times = document.querySelector('[aria-label="本组全部共同时间"]')!
    expect(times.children).toHaveLength(5)
    expect(times.children[0].textContent).toBe("推荐安排2026-11-02 下午")
    expect(times.textContent).toContain("2026-11-03 晚上")
    expect(text()).toContain("4 人已推荐 · 3 人待安排")
    expect(button("确认第 1 个4–6人建议组").disabled).toBe(false)
    await act(async () => button("确认第 1 个4–6人建议组").click())
    expect(props.onConfirm).toHaveBeenCalledExactlyOnceWith(props.recommendations[0])
  })

  it.each([3, 7])("keeps a %i-person recommendation visible while preventing confirmation", async (size) => {
    await render({ recommendations: [{ ...props.recommendations[0], memberIds: ids.slice(0, size) }] })
    expect(document.querySelectorAll('[data-board-small-key="rec-1"] [data-member-id]')).toHaveLength(size)
    expect(text()).toContain(`当前 ${size} 人，请调整为 4–6 人后确认。`)
    expect(button("确认第 1 个4–6人建议组").disabled).toBe(true)
  })

  it("does not trust stale commonSlots after membership changes", async () => {
    await render({
      recommendations: [{ ...props.recommendations[0], commonSlots: [SLOT] }],
      prefs: { ...props.prefs, D: { availability: { "2026-11-04": ["上午"] } } },
    })
    expect(button("确认第 1 个4–6人建议组").disabled).toBe(true)
    expect(text()).toContain("当前成员没有全员共同时间")
    expect(document.querySelector('[aria-label="本组全部共同时间"]')).toBeNull()
  })

  it("requires all members to share a date and period, not just the date", async () => {
    await render({ prefs: Object.fromEntries(ids.map((id) => [id, { availability: { "2026-11-02": id === "D" ? ["上午"] : ["下午"] } }])) })
    expect(button("确认第 1 个4–6人建议组").disabled).toBe(true)
    expect(text()).toContain("没有全员共同时间")
  })

  it("keeps valid shared alternatives visible but blocks a stale recommended arrangement", async () => {
    await render({ recommendations: [{ ...props.recommendations[0], bestSlot: "2026-12-01_下午" }] })
    expect(document.querySelector('[aria-label="本组全部共同时间"]')!.children).toHaveLength(5)
    expect(text()).toContain("原推荐时段已不适用")
    expect(button("确认第 1 个4–6人建议组").disabled).toBe(true)
  })

  it("shows missing availability as incomplete rather than presenting a guessed time", async () => {
    await render({ prefs: { A: { availability }, B: { availability }, C: { availability } } })
    expect(text()).toContain("部分成员缺少有效可用时间")
    expect(button("确认第 1 个4–6人建议组").disabled).toBe(true)
    expect(document.querySelector('[aria-label="本组全部共同时间"]')).toBeNull()
  })

  it("removes a person only from the selected suggestion through an explicit callback", async () => {
    await render()
    const chips = [...document.querySelectorAll<HTMLElement>("[data-member-id]")]
    expect(chips.map((chip) => chip.dataset.instance)).toEqual(Array(4).fill("small:rec-1"))
    expect(chips.every((chip) => chip.dataset.candidate === "true")).toBe(true)
    await act(async () => button("将 示例B移出建议 1").click())
    expect(props.onRemoveMember).toHaveBeenCalledExactlyOnceWith("rec-1", "B")
    expect(props.onConfirm).not.toHaveBeenCalled()
    expect(text()).toContain("人员仍留在上方候选池")
  })

  it("refreshes suggestions only when explicitly requested", async () => {
    await render()
    expect(props.onRefresh).not.toHaveBeenCalled()
    await act(async () => button("重新推荐").click())
    expect(props.onRefresh).toHaveBeenCalledTimes(1)
    expect(props.onConfirm).not.toHaveBeenCalled()
  })

  it("keeps suggestions readable while edits are temporarily unavailable", async () => {
    await render({ editable: false })
    expect(document.querySelector('[data-board-small-key="rec-1"]')).not.toBeNull()
    expect(button("重新推荐").disabled).toBe(true)
    expect(button("确认第 1 个4–6人建议组").disabled).toBe(true)
    expect(document.querySelector('[aria-label="将 示例B移出建议 1"]')).toBeNull()
  })

  it("respects pool locking for refresh, removal and confirmation", async () => {
    await render({ poolLocked: true })
    expect(button("重新推荐").disabled).toBe(true)
    expect(button("将 示例B移出建议 1").disabled).toBe(true)
    expect(button("确认第 1 个4–6人建议组").disabled).toBe(true)
    expect(text()).toContain("多人池已锁定")
  })

  it("keeps confirmed groups separate and reports their actual save and lock state", async () => {
    const group = { key: "formal-1", resultId: "result-1", memberIds: ids.slice(0, 5), bestSlot: SLOT, groupKind: "small" as const }
    await render({ groups: [group], recommendations: [], locked: () => true, isGroupSaved: () => false })
    const card = document.querySelector('[data-board-group-key="formal-1"]')!
    expect(card.textContent).toContain("已确认 · 待保存 · 已锁定")
    expect([...card.querySelectorAll<HTMLElement>("[data-member-id]")].every((chip) => chip.dataset.instance === "group:formal-1")).toBe(true)
    expect(button("解锁第 1 个4–6人小组").getAttribute("aria-pressed")).toBe("true")
    await act(async () => button("解锁第 1 个4–6人小组").click())
    expect(props.onLock).toHaveBeenCalledExactlyOnceWith(group, true)
  })

  it("warns on out-of-range confirmed groups without dropping them", async () => {
    await render({ groups: [{ key: "formal-1", memberIds: ids.slice(0, 3), bestSlot: SLOT, groupKind: "small" }], recommendations: [] })
    expect(document.querySelectorAll('[data-board-group-key="formal-1"] [data-member-id]')).toHaveLength(3)
    expect(text()).toContain("请调整为 4–6 人后保存，或移空解散此组")
  })

  it("hides suggestions on published/read-only boards while keeping confirmed groups", async () => {
    await render({ canRecommend: false, editable: false, groups: [{ key: "formal-1", memberIds: ids.slice(0, 4), bestSlot: SLOT, groupKind: "small" }] })
    expect(document.querySelector('[data-board-group-key="formal-1"]')).not.toBeNull()
    expect(document.querySelector('[aria-label="4–6人分组建议"]')).toBeNull()
    expect(text()).not.toContain("重新推荐")
  })

  it("does not reveal shared availability or suggestions to administrators without raw access", async () => {
    await render({ canViewTimes: false, groups: [{ key: "formal-1", memberIds: ids.slice(0, 4), bestSlot: SLOT, groupKind: "small" }] })
    expect(document.querySelector('[data-board-group-key="formal-1"]')).not.toBeNull()
    expect(document.querySelector('[data-board-small-key]')).toBeNull()
    expect(text()).not.toContain("2026-")
    expect(text()).toContain("需要查看报名资料的权限")
  })

  it("distinguishes pending loading, failure and a valid empty result", async () => {
    await render({ recommendations: [], loading: true, loaded: false })
    expect(document.querySelector('[role="status"]')?.textContent).toContain("正在核对")
    expect(text()).not.toContain("暂时无法组成")
    await render({ loading: false, recommendationError: "方案已变化，请重新载入。" })
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("方案已变化")
    expect(text()).not.toContain("暂时无法组成")
    await render({ loaded: true, recommendationError: undefined })
    expect(text()).toContain("暂时无法组成符合条件的 4–6 人小组")
  })
})
