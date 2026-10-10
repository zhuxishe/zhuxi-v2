import { isValidElement, type ReactElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ActivityReviewActionResult, AdminActivityReviewContext, AdminActivityReviewMember } from "@/lib/activity-reviews/types"

const mocks = vi.hoisted(() => ({
  useState: vi.fn(), save: vi.fn(), saved: vi.fn(), canRefresh: vi.fn(),
  mutation: { pending: false, success: false, error: null as string | null, run: vi.fn() },
}))
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: mocks.useState, useMemo: (compute: () => unknown) => compute() }))
vi.mock("./use-unsaved-activity-reviews", () => ({ useUnsavedActivityReviews: () => mocks.canRefresh }))
vi.mock("./shared", async (original) => ({ ...await original<typeof import("./shared")>(), useAdminReviewMutation: () => mocks.mutation }))
import { ActivityReviewRoster } from "./ActivityReviewRoster"
import { AuditReasonField } from "./shared"

type NodeProps = {
  children?: ReactNode; type?: string; checked?: boolean; disabled?: boolean; value?: string;
  "aria-label"?: string; "aria-pressed"?: boolean;
  onClick?: () => void; onChange?: (event: { target: { value: string } }) => void;
  onSubmit?: (event: { preventDefault: () => void }) => Promise<void>;
}
function find(node: ReactNode, predicate: (element: ReactElement<NodeProps>) => boolean): ReactElement<NodeProps> | undefined {
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean)
  if (!isValidElement<NodeProps>(node)) return
  return predicate(node) ? node : find(node.props.children, predicate)
}
function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textContent).join("")
  return isValidElement<NodeProps>(node) ? textContent(node.props.children) : ""
}
function button(tree: ReactNode, prefix: string) {
  const match = find(tree, (element) => element.type === "button" && textContent(element.props.children).startsWith(prefix))
  if (!match) throw new Error(`Missing button: ${prefix}`)
  return match.props
}
function input(tree: ReactNode, label: string) {
  const match = find(tree, (element) => element.type === "input" && element.props["aria-label"] === label)
  if (!match) throw new Error(`Missing input: ${label}`)
  return match.props
}
function row(tree: ReactNode, name: string) {
  return find(tree, (element) => element.type === "label" && textContent(element.props.children).startsWith(name))
}
function member(memberId: string, fullName: string, overrides: Partial<AdminActivityReviewMember> = {}): AdminActivityReviewMember {
  return { memberId, fullName, nickname: null, source: "registered", included: false, registered: true, eligible: true, canRestore: false, ...overrides }
}
const kept = member("kept", "原有报名甲", { included: true })
const hidden = member("hidden", "搜索外乙", { included: true })
const manual = member("manual", "已选补录丙", { included: true, registered: false, source: "manual" })
const waiting = member("waiting", "待选报名甲", { nickname: "Bamboo" })
const excluded = member("excluded", "手动移出乙", { nickname: "小竹" })
const cancelled = member("cancelled", "已取消丙", { included: true, registered: false, eligible: false, canRestore: true })
const unavailable = member("unavailable", "账号停用丁", { eligible: false })
const unregistered = member("unregistered", "未报名补录戊", { registered: false, source: "manual" })
const extra = { memberId: "extra", fullName: "临时到场己", nickname: null }
const context: AdminActivityReviewContext = {
  roundId: "round-a", title: "秋季迎新派对",
  settings: { enabled: true, autoIncludeRegistered: false, opensAt: "2026-10-10T06:00:00Z", closesAt: "2026-10-17T14:00:00Z", openedAt: "2026-10-10T06:00:00Z", rosterConfirmed: true, version: 7 },
  participants: [kept, hidden, manual, { ...excluded, eligible: false }, cancelled],
  candidates: [kept, hidden, manual, waiting, excluded, cancelled, unavailable, unregistered],
  reviews: [], reports: [], audit: [], canManageSettings: true, canModerateReports: true,
}
const memberOptions = [...context.candidates, extra]
let states: unknown[], cursor: number
function render(value = context) {
  cursor = 0
  return ActivityReviewRoster({ context: value, memberOptions, saveAction: mocks.save, onSaved: mocks.saved })
}
function filter(value = context) { button(render(value), "仅看未勾选报名人员").onClick?.() }
function search(value: string) { input(render(), "检索活动名册").onChange?.({ target: { value } }) }
function setReason(value: string) {
  const field = find(render(), (element) => element.type === AuditReasonField)
  if (!field) throw new Error("Missing reason field")
  const props = field.props as unknown as { onChange: (reason: string) => void }
  props.onChange(value)
}
async function submit(value = context) {
  const form = find(render(value), (element) => element.type === "form")
  if (!form?.props.onSubmit) throw new Error("Missing roster form")
  await form.props.onSubmit({ preventDefault: vi.fn() })
}

beforeEach(() => {
  vi.clearAllMocks(); states = []; cursor = 0
  mocks.mutation.pending = false; mocks.mutation.success = false; mocks.mutation.error = null
  mocks.save.mockResolvedValue({ success: true })
  mocks.canRefresh.mockReturnValue(true)
  mocks.mutation.run.mockImplementation(async (action: () => Promise<ActivityReviewActionResult>) => (await action()).success === true)
  mocks.useState.mockImplementation((initial: unknown) => {
    const index = cursor++
    if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial
    return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value }]
  })
})

describe("activity review roster filtering and bulk selection", () => {
  it("combines the unchecked registration filter with name and nickname search without saving", () => {
    expect(row(render(), cancelled.fullName)).toBeDefined()
    filter()
    expect(button(render(), "仅看未勾选报名人员")["aria-pressed"]).toBe(true)
    expect(row(render(), waiting.fullName)).toBeDefined()
    expect(row(render(), excluded.fullName)).toBeDefined()
    for (const item of [kept, hidden, manual, cancelled, unavailable, unregistered]) expect(row(render(), item.fullName)).toBeUndefined()
    search("  bamboo  ")
    expect(row(render(), waiting.fullName)).toBeDefined()
    expect(row(render(), excluded.fullName)).toBeUndefined()
    expect(textContent(button(render(), "全选当前报名人员").children)).toContain("1")
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("allows an explicitly excluded attendee when their current registration is still eligible", () => {
    filter(); search("手动移出")
    button(render(), "全选当前报名人员").onClick?.()
    search(""); filter()
    const selected = row(render(), excluded.fullName)
    expect(find(selected, (element) => element.type === "input" && element.props.type === "checkbox")?.props.checked).toBe(true)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("excludes cancelled, unavailable and unregistered members from bulk selection even in the full list", () => {
    button(render(), "全选当前报名人员").onClick?.()
    for (const item of [cancelled, unavailable, unregistered]) {
      const checkbox = find(row(render(), item.fullName), (element) => element.type === "input" && element.props.type === "checkbox")
      expect(checkbox?.props.checked).toBe(false)
    }
    expect(textContent(render())).toContain("已选 5 人")
  })

  it("adds only current search results while preserving hidden selections and a newly supplemented member", async () => {
    input(render(), "检索补录成员").onChange?.({ target: { value: "临时到场" } })
    const supplement = find(render(), (element) => element.type === "button" && element.props["aria-label"] === "补录 临时到场己")
    if (!supplement) throw new Error("Missing supplement action")
    supplement.props.onClick?.()
    filter(); search("Bamboo")
    button(render(), "全选当前报名人员").onClick?.()
    setReason("  核对活动报名后批量确认  ")
    await submit()
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ roundId: context.roundId, memberIds: [kept.memberId, hidden.memberId, manual.memberId, extra.memberId, waiting.memberId], expectedVersion: 7, reason: "核对活动报名后批量确认" })
    expect(mocks.saved).toHaveBeenCalledOnce()
  })

  it("is additive and idempotent, and leaves the filtered list empty after selecting all matches", () => {
    filter()
    const firstButton = button(render(), "全选当前报名人员")
    expect(firstButton.type).toBe("button")
    firstButton.onClick?.(); firstButton.onClick?.()
    const tree = render()
    expect(row(tree, waiting.fullName)).toBeUndefined()
    expect(row(tree, excluded.fullName)).toBeUndefined()
    expect(textContent(tree)).toContain("已选 5 人")
    expect(button(tree, "全选当前报名人员").disabled).toBe(true)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("requires the original operation reason before submitting the complete selection and version", async () => {
    filter(); button(render(), "全选当前报名人员").onClick?.()
    await submit()
    expect(mocks.save).not.toHaveBeenCalled()
    setReason("现场核对报名名单")
    await submit()
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ roundId: context.roundId, memberIds: [kept.memberId, hidden.memberId, manual.memberId, waiting.memberId, excluded.memberId], expectedVersion: context.settings.version, reason: "现场核对报名名单" })
  })

  it.each(["unauthorized", "unconfigured", "pending", "saved"])("does not change selection or submit while %s", async (state) => {
    const value = { ...context, canManageSettings: state !== "unauthorized", settings: { ...context.settings, version: state === "unconfigured" ? 0 : 7 } }
    mocks.mutation.pending = state === "pending"; mocks.mutation.success = state === "saved"
    const tree = render(value)
    expect(find(tree, (element) => element.type === "fieldset")?.props.disabled).toBe(true)
    button(tree, "全选当前报名人员").onClick?.()
    expect(textContent(render(value))).toContain("已选 3 人")
    await submit(value)
    expect(mocks.save).not.toHaveBeenCalled()
  })
})
