import { isValidElement, type ReactElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AdminReviewRequirementsResult, ReviewRequirementParticipant } from "@/lib/activity-reviews/requirements"

const mocks = vi.hoisted(() => ({ useState: vi.fn(), useRef: vi.fn(), save: vi.fn(), saved: vi.fn(), cancel: vi.fn(), canRefresh: vi.fn() }))
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: mocks.useState, useRef: mocks.useRef }))
vi.mock("./use-unsaved-activity-reviews", () => ({ useUnsavedActivityReviews: () => mocks.canRefresh }))
import { ReviewRequirementEditor, ReviewRequirementPanel } from "./ReviewRequirementPanel"
import { AuditReasonField, MutationFeedback } from "./shared"

type Props = { children?: ReactNode; type?: string; disabled?: boolean; value?: string; error?: string; person?: ReviewRequirementParticipant; "aria-label"?: string;
  onClick?: () => void; onChange?: (value: unknown) => void; onSubmit?: (event: { preventDefault: () => void }) => Promise<void> }
function find(node: ReactNode, predicate: (element: ReactElement<Props>) => boolean): ReactElement<Props> | undefined {
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean)
  if (!isValidElement<Props>(node)) return
  return predicate(node) ? node : find(node.props.children, predicate)
}
function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textContent).join("")
  return isValidElement<Props>(node) ? textContent(node.props.children) : ""
}
const roundId = "30000000-0000-0000-0000-000000000001"
const person: ReviewRequirementParticipant = { memberId: "10000000-0000-0000-0000-000000000001", fullName: "林秋", nickname: "小秋", state: "pending", exempt: false, exemptionVersion: 0, exemptionReason: null }
const second: ReviewRequirementParticipant = { ...person, memberId: "10000000-0000-0000-0000-000000000002", nickname: "竹叶", state: "exempt", exempt: true, exemptionVersion: 7, exemptionReason: "工作人员核对未成行" }
const ready: AdminReviewRequirementsResult = { status: "ready", data: { required: true, endedAt: "2026-11-17T15:00:00Z", participants: [person, second] } }
let states: unknown[], cursor: number
function panel(result = ready, canManage = true, memberFilter: string | null = null) {
  cursor = 0
  return ReviewRequirementPanel({ roundId, result, canManage, memberFilter, saveAction: mocks.save, onSaved: mocks.saved })
}
function editor(target = person) {
  cursor = 0
  return ReviewRequirementEditor({ roundId, person: target, saveAction: mocks.save, onSaved: mocks.saved, onCancel: mocks.cancel })
}
function reason(value: string, target = person) { find(editor(target), (element) => element.type === AuditReasonField)?.props.onChange?.(value) }
async function submit(target = person) { await find(editor(target), (element) => element.type === "form")?.props.onSubmit?.({ preventDefault: vi.fn() }) }
function button(node: ReactNode, text: string) { return find(node, (element) => element.type === "button" && textContent(element.props.children) === text)?.props }

beforeEach(() => {
  vi.clearAllMocks(); states = []; cursor = 0
  mocks.save.mockResolvedValue({ success: true }); mocks.canRefresh.mockReturnValue(true)
  mocks.useState.mockImplementation((initial: unknown) => {
    const index = cursor++
    if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial
    return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value }]
  })
  mocks.useRef.mockImplementation((initial: unknown) => { const index = cursor++; if (!(index in states)) states[index] = { current: initial }; return states[index] })
})

describe("review exemption administration", () => {
  it("selects the intended same-name member and preserves the round-specific scope", () => {
    const target = find(panel(), (element) => element.props["aria-label"] === "撤销免除 林秋（竹叶）")
    target?.props.onClick?.()
    expect(find(panel(), (element) => element.type === ReviewRequirementEditor)?.props.person).toEqual(second)
    expect(textContent(panel())).toContain("不免除其他活动的要求")
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it("filters by nickname and respects the selected member scope", () => {
    find(panel(), (element) => element.props["aria-label"] === "检索报名评分要求成员")?.props.onChange?.({ target: { value: "竹叶" } })
    expect(textContent(panel())).not.toContain("小秋")
    expect(textContent(panel())).toContain("竹叶")
    expect(textContent(panel(ready, true, person.memberId))).not.toContain("竹叶")
    expect(textContent(panel(ready, true, person.memberId))).toContain("没有找到")
  })
  it("requires a reason and sends only the chosen member and the captured version", async () => {
    expect(button(editor(), "确认免除本场要求")?.disabled).toBe(true)
    await submit(); expect(mocks.save).not.toHaveBeenCalled()
    reason("  工作人员核实未成行  ")
    await submit()
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ roundId, memberId: person.memberId, exempt: true, expectedVersion: 0, reason: "工作人员核实未成行" })
    expect(mocks.saved).toHaveBeenCalledOnce()
  })
  it("revokes the selected exemption with its own version instead of granting another", async () => {
    reason("已核实实际参与活动", second)
    await submit(second)
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ roundId, memberId: second.memberId, exempt: false, expectedVersion: 7, reason: "已核实实际参与活动" })
  })
  it("keeps the reason on a version conflict and does not announce success", async () => {
    mocks.save.mockResolvedValueOnce({ error: "PEER_VERSION_CONFLICT" })
    reason("工作人员核实未成行")
    await submit()
    expect(find(editor(), (element) => element.type === AuditReasonField)?.props.value).toBe("工作人员核实未成行")
    expect(find(editor(), (element) => element.type === MutationFeedback)?.props.error).toContain("输入已保留")
    expect(find(editor(), (element) => element.type === MutationFeedback)?.props.error).toContain("刷新核对")
    expect(mocks.saved).not.toHaveBeenCalled()
  })
  it("allows retry after a network failure with the same reason and target", async () => {
    mocks.save.mockRejectedValueOnce(new Error("network offline"))
    reason("工作人员核实未成行"); await submit()
    expect(find(editor(), (element) => element.type === AuditReasonField)?.props.value).toBe("工作人员核实未成行")
    expect(button(editor(), "确认免除本场要求")?.disabled).toBe(false)
    await submit()
    expect(mocks.save).toHaveBeenCalledTimes(2)
    expect(mocks.saved).toHaveBeenCalledOnce()
  })
  it("does not send duplicate requests or allow cancellation while a save is pending", async () => {
    let resolve!: (value: { success: boolean }) => void
    mocks.save.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    reason("工作人员核实未成行")
    const first = submit()
    await submit()
    button(editor(), "取消")?.onClick?.()
    expect(mocks.save).toHaveBeenCalledOnce(); expect(mocks.cancel).not.toHaveBeenCalled()
    expect(button(editor(), "取消")?.disabled).toBe(true)
    resolve({ success: true }); await first
  })
  it("does not mutate if another management form has unsaved changes", async () => {
    mocks.canRefresh.mockReturnValue(false)
    reason("工作人员核实未成行"); await submit()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it.each(["unavailable", "failed"] as const)("shows a recoverable %s state without mutation controls", (status) => {
    const tree = panel({ status })
    expect(button(tree, "免除本场要求")).toBeUndefined()
    button(tree, "重新读取")?.onClick?.()
    expect(mocks.saved).toHaveBeenCalledOnce(); expect(mocks.save).not.toHaveBeenCalled()
  })
  it("has no exemption controls for an excluded historical activity", () => {
    const tree = panel({ status: "ready", data: { ...ready.data, required: false } })
    expect(textContent(tree)).toContain("本场活动未纳入")
    expect(button(tree, "免除本场要求")).toBeUndefined()
  })
  it("does not allow a read-only administrator to select an exemption", () => {
    const tree = panel(ready, false)
    expect(button(tree, "免除本场要求")?.disabled).toBe(true)
    button(tree, "免除本场要求")?.onClick?.()
    expect(find(panel(ready, false), (element) => element.type === ReviewRequirementEditor)).toBeUndefined()
  })
})
