import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ActivityReport, ActivityReview, ActivityReviewParticipant } from "@/lib/activity-reviews/types"

const mocks = vi.hoisted(() => ({ action: vi.fn(), useState: vi.fn(), useRef: vi.fn() }))
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: mocks.useState, useRef: mocks.useRef }))
vi.mock("@/app/app/matches/rounds/[roundId]/reviews/actions", () => ({ submitActivityReviewAction: mocks.action }))
import { ActivityReviewEditor, type ActivityReviewDraft } from "./ActivityReviewEditor"

type Props = { children?: ReactNode; id?: string; value?: unknown; disabled?: boolean; open?: boolean; role?: string;
  onClick?: () => void | Promise<void>; onChange?: (event: unknown) => void; onOpenChange?: (value: boolean) => void; "aria-expanded"?: boolean }
function find(node: ReactNode, predicate: (props: Props) => boolean): Props | undefined {
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean)
  if (!isValidElement<Props>(node)) return
  return predicate(node.props) ? node.props : find(node.props.children, predicate)
}
const participant: ActivityReviewParticipant = { memberId: "member-two", fullName: "林同学", nickname: "小竹", review: null, report: null }
const review: ActivityReview = { id: "review", revieweeId: participant.memberId, score: 4.5, comment: "交流愉快", version: 3, valid: true, updatedAt: "2026-10-10T12:00:00Z" }
const report: ActivityReport = { id: "report", revieweeId: participant.memberId, category: "privacy", detail: "未经同意拍摄并公开活动照片。", status: "pending", version: 2, createdAt: "2026-10-10T12:00:00Z", updatedAt: "2026-10-10T12:00:00Z", supplements: [] }
let states: unknown[], refs: { current: unknown }[], stateCursor: number, refCursor: number
function render(overrides: Partial<Parameters<typeof ActivityReviewEditor>[0]> = {}) {
  stateCursor = 0; refCursor = 0
  return ActivityReviewEditor({ roundId: "round", participant, canReview: true, canReport: true, locale: "zh", ...overrides })
}
function button(text: string, tree = render()) {
  const props = find(tree, (props) => props.children === text && Boolean(props.onClick))
  if (!props?.onClick) throw new Error(`Missing ${text}`)
  return props as Props & { onClick: () => void | Promise<void> }
}
function setField(id: string, value: string, tree = render()) { find(tree, (props) => props.id === id)?.onChange?.({ target: { value } }) }
async function openReport(tree = render()) {
  await find(tree, (props) => props["aria-expanded"] !== undefined)?.onClick?.()
  await button("继续填写举报").onClick()
}

describe("event review editor submission boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks(); states = []; refs = []
    mocks.useState.mockImplementation((initial: unknown) => {
      const index = stateCursor++
      if (!(index in states)) states[index] = initial
      return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value }]
    })
    mocks.useRef.mockImplementation((initial: unknown) => { const index = refCursor++; return refs[index] ?? (refs[index] = { current: initial }) })
    mocks.action.mockResolvedValue({ success: true })
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => callback())
  })

  it("starts without a score and confirmation only reveals the report form", async () => {
    expect(find(render(), (props) => props.value === null && Boolean(props.onChange))).toBeDefined()
    expect(button("保存评价").disabled).toBe(true)
    await find(render(), (props) => props["aria-expanded"] !== undefined)?.onClick?.()
    expect(find(render(), (props) => Boolean(props.onOpenChange))?.open).toBe(true)
    expect(mocks.action).not.toHaveBeenCalled()
    await button("继续填写举报").onClick()
    expect(find(render(), (props) => props.id === "activity-report-detail")).toBeDefined()
    expect(mocks.action).not.toHaveBeenCalled()
  })

  it("submits a report without creating a rating or saving an unsaved comment", async () => {
    await openReport()
    setField("activity-review-comment", "这个尚未保存")
    setField("activity-report-detail", "未经同意拍摄并公开了活动照片。")
    await button("仅提交举报").onClick()
    expect(mocks.action.mock.calls[0][0]).toMatchObject({ operation: "save", roundId: "round", targetMemberId: "member-two", report: { category: "other", detail: "未经同意拍摄并公开了活动照片。", expectedVersion: 0 } })
    expect(mocks.action.mock.calls[0][0]).not.toHaveProperty("review")
  })

  it("submits half-point score and report together only through the combined button", async () => {
    await openReport()
    find(render(), (props) => props.value === null && Boolean(props.onChange))?.onChange?.(4.5)
    setField("activity-review-comment", "交流很愉快")
    setField("activity-report-detail", "另一环节中发生了需要管理员了解的情况。")
    await button("保存评价并提交举报").onClick()
    expect(mocks.action.mock.calls[0][0]).toMatchObject({ operation: "save", review: { score: 4.5, comment: "交流很愉快", expectedVersion: 0 }, report: { expectedVersion: 0 } })
  })

  it("editing a saved score passes its version without overwriting a report", async () => {
    const overrides = { participant: { ...participant, review, report } }
    setField("activity-review-comment", "修改后的评论", render(overrides))
    await button("更新评价", render(overrides)).onClick()
    expect(mocks.action.mock.calls[0][0].review).toEqual({ score: 4.5, comment: "修改后的评论", expectedVersion: 3 })
    expect(mocks.action.mock.calls[0][0]).not.toHaveProperty("report")
  })

  it("appends a supplement using the report version and retains the original record", async () => {
    const overrides = { participant: { ...participant, review, report: { ...report, status: "reviewing" as const } }, canReview: false }
    await find(render(overrides), (props) => props["aria-expanded"] !== undefined)?.onClick?.()
    setField("activity-report-supplement", "补充说明：事发时间约为下午三点。", render(overrides))
    await button("提交补充", render(overrides)).onClick()
    expect(mocks.action.mock.calls[0][0]).toMatchObject({ operation: "append_report", report: { category: "privacy", detail: "补充说明：事发时间约为下午三点。", expectedVersion: 2 } })
    expect(mocks.action.mock.calls[0][0]).not.toHaveProperty("review")
    expect(find(render(overrides), (props) => props.children === report.detail)).toBeDefined()
  })

  it("preserves the attempt ID and draft on network retry, then uses the returned version", async () => {
    mocks.action.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ success: true, review: { ...review, version: 1 } })
    find(render(), (props) => props.value === null && Boolean(props.onChange))?.onChange?.(4.5)
    await button("保存评价").onClick()
    expect(find(render(), (props) => props.role === "alert")?.children).toContain("网络异常")
    await button("保存评价").onClick()
    expect(mocks.action.mock.calls[0][0].requestId).toBe(mocks.action.mock.calls[1][0].requestId)
    await button("更新评价").onClick()
    expect(mocks.action.mock.calls[2][0].review.expectedVersion).toBe(1)
    expect(mocks.action.mock.calls[2][0].requestId).not.toBe(mocks.action.mock.calls[1][0].requestId)
  })

  it("shows a safe version-conflict message and leaves the draft available", async () => {
    mocks.action.mockResolvedValue({ error: "PEER_CONFLICT" })
    find(render(), (props) => props.value === null && Boolean(props.onChange))?.onChange?.(3.5)
    setField("activity-review-comment", "保留我的修改")
    await button("保存评价").onClick()
    expect(find(render(), (props) => props.role === "alert")?.children).toContain("其他页面更新")
    expect(find(render(), (props) => props.id === "activity-review-comment")?.value).toBe("保留我的修改")
  })

  it("ignores repeated clicks while a submission is pending", async () => {
    let finish!: (value: { success: true }) => void
    mocks.action.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    find(render(), (props) => props.value === null && Boolean(props.onChange))?.onChange?.(5)
    const save = button("保存评价")
    const pending = save.onClick(); await save.onClick()
    expect(mocks.action).toHaveBeenCalledOnce()
    finish({ success: true }); await pending
  })

  it("keeps an invalidated rating read-only while leaving the report entry available", () => {
    const tree = render({ participant: { ...participant, review: { ...review, valid: false } } })
    expect(find(tree, (props) => props.children === "更新评价" && Boolean(props.onClick))).toBeUndefined()
    expect(find(tree, (props) => props.id === "activity-review-comment")?.disabled).toBe(true)
    expect(find(tree, (props) => props["aria-expanded"] !== undefined)?.disabled).toBe(false)
  })

  it("restores an unsaved per-person draft after switching away and back", () => {
    let draft: ActivityReviewDraft | undefined
    const onDraftChange = (value: ActivityReviewDraft) => { draft = value }
    find(render({ onDraftChange }), (props) => props.value === null && Boolean(props.onChange))?.onChange?.(4.5)
    setField("activity-review-comment", "切换后保留这段未提交评论", render({ onDraftChange }))
    states = []; refs = []
    const restored = render({ draft, onDraftChange })
    expect(find(restored, (props) => props.id === "activity-review-comment")?.value).toBe("切换后保留这段未提交评论")
    expect(find(restored, (props) => props.value === 4.5 && Boolean(props.onChange))).toBeDefined()
    expect(mocks.action).not.toHaveBeenCalled()
  })

  it("signals the parent while saving and schedules error focus for an offscreen failure", async () => {
    const frame = vi.fn()
    vi.stubGlobal("requestAnimationFrame", frame)
    const onBusyChange = vi.fn()
    mocks.action.mockResolvedValue({ error: "PEER_VERSION_CONFLICT" })
    find(render({ onBusyChange }), (props) => props.value === null && Boolean(props.onChange))?.onChange?.(4.5)
    await button("保存评价", render({ onBusyChange })).onClick()
    expect(onBusyChange.mock.calls).toEqual([[true], [false]])
    expect(frame).toHaveBeenCalledOnce()
    const error = find(render({ onBusyChange }), (props) => props.role === "alert")
    expect(error?.children).toContain("这条记录")
  })

  it("stops offering report supplements at the database limit while preserving its history", async () => {
    const fullReport = { ...report, status: "resolved" as const, supplements: Array.from({ length: 50 }, (_, index) => ({ detail: `已提交补充 ${index}`, createdAt: "2026-10-10T12:00:00Z" })) }
    const overrides = { participant: { ...participant, report: fullReport } }
    await find(render(overrides), (props) => props["aria-expanded"] !== undefined)?.onClick?.()
    const tree = render(overrides)
    expect(find(tree, (props) => props.id === "activity-report-supplement")).toBeUndefined()
    expect(find(tree, (props) => props.children === "本次举报的补充信息已达到上限。")).toBeDefined()
    expect(find(tree, (props) => props.children === report.detail)).toBeDefined()
  })

  it("edits a pending report's category and details from the saved values without submitting its rating", async () => {
    const overrides = { participant: { ...participant, review, report }, mode: "report" as const }
    let tree = render(overrides)
    expect(find(tree, (props) => props.id === "activity-report-category")?.value).toBe("privacy")
    expect(find(tree, (props) => props.id === "activity-report-detail")?.value).toBe(report.detail)
    expect(find(tree, (props) => props.id === "activity-review-comment")).toBeUndefined()
    setField("activity-report-category", "disruption", tree)
    setField("activity-report-detail", "更正说明：对方在游戏过程中多次打断主持。", render(overrides))
    mocks.action.mockResolvedValue({ success: true, report: { ...report, category: "disruption", detail: "更正说明：对方在游戏过程中多次打断主持。", version: 3 } })
    await button("保存修改", render(overrides)).onClick()
    expect(mocks.action.mock.calls[0][0]).toMatchObject({ operation: "edit_report", report: { category: "disruption", detail: "更正说明：对方在游戏过程中多次打断主持。", expectedVersion: 2 } })
    expect(mocks.action.mock.calls[0][0]).not.toHaveProperty("review")
    tree = render(overrides)
    expect(find(tree, (props) => props.id === "activity-report-detail")?.value).toBe("更正说明：对方在游戏过程中多次打断主持。")
    await button("保存修改", tree).onClick()
    expect(mocks.action.mock.calls[1][0].report.expectedVersion).toBe(3)
  })

  it.each(["reviewing", "resolved", "dismissed"] as const)("preserves a %s report and sends a correction as a supplement", async (status) => {
    const overrides = { participant: { ...participant, report: { ...report, status } }, mode: "report" as const, canReview: false }
    const tree = render(overrides)
    expect(find(tree, (props) => props.id === "activity-report-category")).toBeUndefined()
    expect(find(tree, (props) => props.id === "activity-report-detail")).toBeUndefined()
    expect(find(tree, (props) => props.children === report.detail)).toBeDefined()
    setField("activity-report-supplement", "更正发生时间：应为下午两点左右。", tree)
    await button("提交补充", render(overrides)).onClick()
    expect(mocks.action.mock.calls[0][0]).toMatchObject({ operation: "append_report", report: { expectedVersion: 2, detail: "更正发生时间：应为下午两点左右。" } })
    expect(mocks.action.mock.calls[0][0]).not.toHaveProperty("review")
  })

  it("keeps a pending-report draft when moderation changes before saving", async () => {
    const overrides = { participant: { ...participant, report }, mode: "report" as const }
    setField("activity-report-detail", "更正后的具体举报情况，需要管理员确认。", render(overrides))
    mocks.action.mockResolvedValue({ error: "PEER_REPORT_NOT_EDITABLE" })
    await button("保存修改", render(overrides)).onClick()
    const tree = render(overrides)
    expect(find(tree, (props) => props.role === "alert")?.children).toContain("举报处理状态已变化")
    expect(find(tree, (props) => props.id === "activity-report-detail")?.value).toBe("更正后的具体举报情况，需要管理员确认。")
  })

  it("cancels a review edit without saving and prevents cancellation during a submission", async () => {
    const onCancel = vi.fn()
    const overrides = { participant: { ...participant, review, report }, mode: "review" as const, onCancel }
    setField("activity-review-comment", "这段修改还没有保存", render(overrides))
    expect(find(render(overrides), (props) => props["aria-expanded"] !== undefined)).toBeUndefined()
    await button("取消", render(overrides)).onClick()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(mocks.action).not.toHaveBeenCalled()
    let finish!: (value: { success: true }) => void
    mocks.action.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const pending = button("更新评价", render(overrides)).onClick()
    expect(button("取消", render(overrides)).disabled).toBe(true)
    await button("取消", render(overrides)).onClick()
    expect(onCancel).toHaveBeenCalledOnce()
    finish({ success: true }); await pending
  })
})
