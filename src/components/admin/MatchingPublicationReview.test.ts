// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MatchingReviewGroup, MatchingReviewMember, SavedMatchingReview } from "@/lib/matching/session-review-types"
import { MatchingPublicationReview, type MatchingPublicationReviewProps } from "./MatchingPublicationReview"

const SLOT = "2026-11-04_下午"
const others = ["2026-11-05_上午", "2026-11-05_下午", "2026-11-06_晚上", "2026-11-07_上午"]
const member = (id: string): MatchingReviewMember => ({ id, name: `示例${id}`, memberNumber: `ZXS_${id}` })
const group = (resultId: string, label: string, ids: string[], kind: "duo" | "multi" = "duo"): MatchingReviewGroup => ({ resultId, label, kind, members: ids.map(member), recommendedSlot: SLOT, commonSlots: [SLOT, ...others], timeStatus: "ready" })
const fixture = (): SavedMatchingReview => ({
  sessionId: "session", revisionToken: "revision", publicationSignature: "signature", capturedAt: "2026-11-02T05:00:00Z", sessionStatus: "draft", publicationVersion: 0, canViewTimes: true,
  groups: [group("duo-1", "双人 01", ["A", "B"]), group("multi-1", "多人 01", ["C", "D", "E", "F", "G"], "multi"), { ...group("multi-2", "多人 02", ["H", "I", "J", "K"], "multi"), groupKind: "small" }],
  waitingDuo: [member("L")], waitingMulti: [member("M")], unmatched: [member("N")],
  summary: { total: 14, duoGroups: 1, multiGroups: 2, matched: 11, waitingDuo: 1, waitingMulti: 1, unmatched: 1 }, issues: [],
})
let root: Root
let props: MatchingPublicationReviewProps
const text = () => document.body.textContent ?? ""
const resultRows = () => [...document.querySelectorAll<HTMLTableRowElement>("[data-review-result]")]
function button(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.getAttribute("aria-label") === label || item.textContent?.trim() === label)
  if (!found) throw new Error(`Button not found: ${label}`)
  return found
}
async function click(label: string) { await act(async () => button(label).click()) }
async function search(value: string) {
  const input = document.querySelector<HTMLInputElement>('[aria-label="搜索已保存分组成员"]')!
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })) })
}
async function render(overrides: Partial<MatchingPublicationReviewProps> = {}) {
  props = { ...props, ...overrides }
  await act(async () => root.render(createElement(MatchingPublicationReview, props)))
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  document.body.innerHTML = '<div id="root"></div>'
  root = createRoot(document.getElementById("root")!)
  props = { review: fixture(), blocked: false, loading: false, onRefresh: vi.fn() }
})
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks() })

describe("saved publication review table", () => {
  it("shows each saved duo or multiplayer group exactly once in a compact four-column table", async () => {
    await render()
    expect(resultRows().map((row) => row.dataset.reviewResult)).toEqual(["duo-1", "multi-1", "multi-2"])
    expect(document.querySelectorAll("thead th")).toHaveLength(4)
    expect(resultRows()[0].textContent).toContain("示例A ＆ 示例B")
    expect(resultRows()[1].textContent).toContain("示例C、示例D、示例E、示例F、示例G")
    expect(text()).toContain("已保存 · 尚未发布")
    expect(text()).toContain("11 人已匹配")
    expect(text()).toContain("2 人待安排")
    expect(props.onRefresh).not.toHaveBeenCalled()
  })

  it("excludes recommended time from alternatives and expands only the selected group's other times", async () => {
    await render()
    const row = resultRows()[0]
    expect(row.querySelectorAll("td")[1].textContent).toBe("2026-11-04 下午")
    expect(row.querySelectorAll("td")[2].textContent).not.toContain("2026-11-04 下午")
    expect(row.textContent).toContain("另有 2 个，展开")
    expect(row.textContent).not.toContain("2026-11-06 晚上")
    await click("展开双人 01的其他共同时间")
    expect(row.textContent).toContain("2026-11-06 晚上")
    expect(row.textContent).toContain("2026-11-07 上午")
    expect(resultRows()[1].textContent).not.toContain("2026-11-07 上午")
    expect(button("收起双人 01的其他共同时间").getAttribute("aria-expanded")).toBe("true")
    await click("收起双人 01的其他共同时间")
    expect(row.textContent).not.toContain("2026-11-07 上午")
  })

  it("filters by group type without renumbering groups", async () => {
    await render(); await click("多人")
    expect(resultRows().map((row) => row.querySelector("th")?.textContent)).toEqual(["多人 015 人", "多人 024 人"])
    expect(button("多人").getAttribute("aria-pressed")).toBe("true")
    await click("双人")
    expect(resultRows().map((row) => row.dataset.reviewResult)).toEqual(["duo-1"])
    await click("全部")
    expect(resultRows()).toHaveLength(3)
  })

  it("searches all members of a group by name or member number and retains full group membership", async () => {
    await render(); await search("示例J")
    expect(resultRows().map((row) => row.dataset.reviewResult)).toEqual(["multi-2"])
    expect(resultRows()[0].textContent).toContain("示例H、示例I、示例J、示例K")
    await search("zxs_c")
    expect(resultRows().map((row) => row.dataset.reviewResult)).toEqual(["multi-1"])
    await search("不存在")
    expect(resultRows()).toHaveLength(0)
    expect(text()).toContain("没有符合筛选条件的分组")
    expect(text()).toContain("全部 3 组")
  })

  it("separately lists waiting-duo, waiting-multiplayer and truly unmatched people", async () => {
    await render()
    const pending = document.querySelector('[aria-label="未进入有效分组的人员"]')!
    expect(pending.textContent).toContain("待双人搭档 · 1 人示例L")
    expect(pending.textContent).toContain("待多人分组 · 1 人示例M")
    expect(pending.textContent).toContain("未匹配 · 1 人示例N")
    expect(resultRows().some((row) => /示例[L-N]/.test(row.textContent ?? ""))).toBe(false)
    await search("示例M")
    expect(pending.textContent).toContain("示例M")
    expect(pending.textContent).not.toContain("示例L")
  })

  it("never renders saved rows or counts while unsaved or pending edits block review", async () => {
    await render({ blocked: true })
    expect(text()).toContain("请先保存")
    expect(text()).not.toContain("示例A")
    expect(text()).not.toContain("11 人已匹配")
    expect(document.querySelector("table")).toBeNull()
    expect(button("重新核对").disabled).toBe(true)
    await click("重新核对")
    expect(props.onRefresh).not.toHaveBeenCalled()
    await render({ blockedReason: "保存结果待确认，请先核对上次保存。" })
    expect(text()).toContain("保存结果待确认")
  })

  it("hides old results on reload/error and offers a read-only retry", async () => {
    await render({ loading: true })
    expect(text()).toContain("正在读取")
    expect(text()).not.toContain("示例A")
    expect(button("核对中…").disabled).toBe(true)
    await render({ loading: false, error: "资料已变化，请重新核对。" })
    expect(text()).toContain("资料已变化")
    expect(document.querySelector("table")).toBeNull()
    await click("重新核对")
    expect(props.onRefresh).toHaveBeenCalledOnce()
  })

  it("does not turn a missing review into an empty matched result", async () => {
    await render({ review: null })
    expect(text()).toContain("暂时无法读取已保存结果")
    expect(text()).not.toContain("没有有效配对")
    expect(document.querySelector("table")).toBeNull()
  })

  it("permits a safe refresh of an outdated read while still hiding stale rows", async () => {
    await render({ blocked: true, blockedReason: "方案版本已变化，请重新核对。", refreshDisabled: false })
    expect(resultRows()).toHaveLength(0)
    expect(button("重新核对").disabled).toBe(false)
    await click("重新核对")
    expect(props.onRefresh).toHaveBeenCalledOnce()
  })

  it("never exposes shared availability when raw-data access is unavailable", async () => {
    const review = fixture(); review.canViewTimes = false
    await render({ review })
    expect(text()).toContain("2026-11-04 下午")
    expect(text()).not.toContain("2026-11-05")
    expect(text()).toContain("需报名资料查看权限")
    expect(document.querySelector('button[aria-expanded]')).toBeNull()
  })

  it("distinguishes unavailable, empty, and recommendation-only intersections", async () => {
    const review = fixture()
    review.groups[0].timeStatus = "unavailable"
    review.groups[1].commonSlots = []
    review.groups[2].commonSlots = [SLOT]
    await render({ review })
    expect(resultRows()[0].textContent).toContain("资料不足，待核对")
    expect(resultRows()[1].textContent).toContain("无共同时间，待核对")
    expect(resultRows()[1].textContent).toContain("推荐时间已不在当前共同时间中")
    expect(resultRows()[2].textContent).toContain("无其他共同时间")
    expect(resultRows()[2].textContent).not.toContain("推荐时间已不在")
  })

  it("shows a published state and Tokyo read time, without adding any publication action", async () => {
    const review = fixture(); review.sessionStatus = "confirmed"; review.publicationVersion = 2
    await render({ review })
    expect(text()).toContain("已发布 · 第 2 版")
    expect(text()).toContain("2026/11/2 14:00:00")
    expect(text()).not.toContain("确认发布")
    expect(text()).not.toContain("保存调整")
  })

  it("loads a hundred-person list twenty groups at a time and searches beyond visible rows", async () => {
    const review = fixture()
    review.groups = Array.from({ length: 50 }, (_, index) => group(`duo-${index}`, `双人 ${String(index + 1).padStart(2, "0")}`, [`${index * 2 + 1}`, `${index * 2 + 2}`]))
    review.waitingDuo = []; review.waitingMulti = []; review.unmatched = []
    review.summary = { total: 100, duoGroups: 50, multiGroups: 0, matched: 100, waitingDuo: 0, waitingMulti: 0, unmatched: 0 }
    await render({ review })
    expect(resultRows()).toHaveLength(20)
    expect(text()).toContain("显示 20 / 50 组")
    await click("再显示 20 组")
    expect(resultRows()).toHaveLength(40)
    await click("再显示 10 组")
    expect(resultRows()).toHaveLength(50)
    await search("ZXS_100")
    expect(resultRows()).toHaveLength(1)
    expect(resultRows()[0].textContent).toContain("双人 50")
    await search("")
    expect(resultRows()).toHaveLength(20)
  })

  it("resets expanded data and filters when a different saved revision arrives", async () => {
    await render(); await click("展开双人 01的其他共同时间"); await search("示例A")
    await render({ review: { ...fixture(), revisionToken: "new-revision" } })
    expect(resultRows()).toHaveLength(3)
    expect(resultRows()[0].textContent).not.toContain("2026-11-07 上午")
    expect(document.querySelector<HTMLInputElement>('input[aria-label="搜索已保存分组成员"]')!.value).toBe("")
  })

  it("surfaces safe validation issues without hiding the saved group arrangement", async () => {
    const review = fixture(); review.issues = ["仍有成员等待多人分组。"]
    await render({ review })
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("仍有成员等待多人分组")
    expect(resultRows()).toHaveLength(3)
  })
  it("reviews the saved public message and exact unmatched recipients, including waiting duo but excluding pending multi", async () => {
    const review = fixture(); review.unmatchedMessage = "  后续继续协调\n<script>literal</script>  "
    await render({ review })
    const message = document.querySelector('[aria-label="未匹配工作人员留言"]')!
    expect(message.textContent).toContain("后续继续协调\n<script>literal</script>")
    expect(message.textContent).toContain("待核对接收范围 · 2 人（含等待双人搭档人员）")
    expect(message.textContent).toContain("示例L、示例N")
    expect(message.textContent).not.toContain("示例M")
    expect(message.querySelector("script")).toBeNull()
    await render({ blocked: true })
    expect(document.querySelector('[aria-label="未匹配工作人员留言"]')).toBeNull()
  })
  it("omits an empty staff message and explains when a saved message currently has no recipients", async () => {
    await render({ review: { ...fixture(), unmatchedMessage: " \n " } })
    expect(document.querySelector('[aria-label="未匹配工作人员留言"]')).toBeNull()
    await render({ review: { ...fixture(), unmatchedMessage: "后续协调", waitingDuo: [], unmatched: [] } })
    expect(text()).toContain("当前没有未匹配接收人")
  })
  it("shows only the exact current publication recipients when the server provides them", async () => {
    await render({ review: { ...fixture(), unmatchedMessage: "后续协调", messageRecipients: [member("N")] } })
    const message = document.querySelector('[aria-label="未匹配工作人员留言"]')!
    expect(message.textContent).toContain("本次可接收 · 1 人")
    expect(message.textContent).toContain("示例N")
    expect(message.textContent).not.toContain("示例L")
    expect(message.textContent).not.toContain("待核对接收范围")
    await render({ review: { ...fixture(), unmatchedMessage: "后续协调", messageRecipients: [] } })
    expect(message.textContent).toContain("当前没有未匹配接收人")
  })
})
