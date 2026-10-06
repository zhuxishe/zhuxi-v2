import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ActivityReport, ActivityReview, ActivityReviewParticipant } from "@/lib/activity-reviews/types"
import { validateReviewSubmission } from "@/lib/activity-reviews/validation"

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

  it("confirms a one-point rating before revealing the report, without saving on confirm or cancel", async () => {
    find(render(), (props) => props.value === null && Boolean(props.onChange))?.onChange?.(1)
    setField("activity-review-comment", "保留这段未保存的评论")
    await button("保存评价").onClick()
    expect(find(render(), (props) => Boolean(props.onOpenChange))?.open).toBe(true)
    expect(find(render(), (props) => props.children === "1.0分默认对方存在恶意行为，不适合社团健康发展行为，并自动进行举报。请问仍要提交1分的评价吗？")).toBeDefined()
    await button("取消").onClick()
    expect(find(render(), (props) => props.id === "activity-report-detail")).toBeUndefined()
    expect(mocks.action).not.toHaveBeenCalled()
    await button("保存评价").onClick()
    await button("确定").onClick()
    expect(find(render(), (props) => props.id === "activity-report-detail")).toBeDefined()
    expect(find(render(), (props) => props.id === "activity-review-comment")?.value).toBe("保留这段未保存的评论")
    expect(mocks.action).not.toHaveBeenCalled()
  })

  it.each(["保存评价并提交举报", "仅提交举报"])("requires a second confirmation for %s at 1.0 and preserves the intended payload", async (label) => {
    find(render(), (props) => props.value === null && Boolean(props.onChange))?.onChange?.(1)
    await button("保存评价").onClick()
    await button("确定").onClick()
    setField("activity-report-detail", "具体情况：对方在活动中多次恶意干扰他人。")
    await button(label).onClick()
    expect(find(render(), (props) => props.children === "提交1.0分评价或举报时候，将自动接入人工审查。为确保社团良性发展，您和对方或许只能保留一位成员继续在社团活动。请问仍要进行举报吗？")).toBeDefined()
    await button("取消").onClick()
    expect(mocks.action).not.toHaveBeenCalled()
    expect(find(render(), (props) => props.id === "activity-report-detail")?.value).toContain("具体情况")
    await button(label).onClick()
    await button("确定").onClick()
    // Confirmation dispatches asynchronously, but calls the action synchronously.
    expect(mocks.action).toHaveBeenCalledOnce()
    const input = mocks.action.mock.calls[0][0]
    expect(input).toMatchObject({ operation: "save", report: { expectedVersion: 0 } })
    if (label === "仅提交举报") expect(input).not.toHaveProperty("review")
    else expect(input.review).toEqual({ score: 1, comment: "", expectedVersion: 0 })
  })

  it("uses the latest score after cancelling a one-point confirmation", async () => {
    find(render(), (props) => props.value === null && Boolean(props.onChange))?.onChange?.(1)
    await button("保存评价").onClick()
    await button("取消").onClick()
    find(render(), (props) => props.value === 1 && Boolean(props.onChange))?.onChange?.(1.5)
    await button("保存评价").onClick()
    expect(mocks.action).toHaveBeenCalledOnce()
    expect(mocks.action.mock.calls[0][0].review.score).toBe(1.5)
  })

  it("opens reporting inside historical review edits and submits the saved review version atomically", async () => {
    const overrides = { participant: { ...participant, review }, mode: "review" as const }
    find(render(overrides), (props) => props.value === 4.5 && Boolean(props.onChange))?.onChange?.(1)
    await button("更新评价", render(overrides)).onClick()
    await button("确定", render(overrides)).onClick()
    setField("activity-report-detail", "具体情况：对方在活动中多次恶意干扰他人。", render(overrides))
    await button("保存评价并提交举报", render(overrides)).onClick()
    expect(mocks.action).not.toHaveBeenCalled()
    await button("确定", render(overrides)).onClick()
    expect(mocks.action.mock.calls[0][0]).toMatchObject({ operation: "save", review: { score: 1, expectedVersion: 3 }, report: { expectedVersion: 0 } })
  })

  it.each(["pending", "reviewing", "resolved", "dismissed"] as const)("queues a %s report with a supplement and 1.0 score in one supported request", async (status) => {
    const overrides = { participant: { ...participant, review: { ...review, score: 1 }, report: { ...report, status } } }
    await button("更新评价", render(overrides)).onClick()
    await button("确定", render(overrides)).onClick()
    expect(find(render(overrides), (props) => props.children === "保存 1.0 分评价")).toBeUndefined()
    setField("activity-report-supplement", "补充说明：需要重新核实对方在活动中的行为。", render(overrides))
    await button("保存评价并提交补充", render(overrides)).onClick()
    expect(mocks.action).not.toHaveBeenCalled()
    await button("确定", render(overrides)).onClick()
    const input = mocks.action.mock.calls[0][0]
    expect(input).toMatchObject({ operation: "save", review: { score: 1, expectedVersion: 3 }, report: { category: "privacy", expectedVersion: 2, detail: "补充说明：需要重新核实对方在活动中的行为。" } })
    expect(validateReviewSubmission({ ...input, roundId: "11111111-1111-4111-8111-111111111111", targetMemberId: "22222222-2222-4222-8222-222222222222" })).toBeNull()
  })

  it("does not submit invalid details or a one-point review without report access", async () => {
    const overrides = { canReport: false }
    find(render(overrides), (props) => props.value === null && Boolean(props.onChange))?.onChange?.(1)
    await button("保存评价", render(overrides)).onClick()
    expect(mocks.action).not.toHaveBeenCalled()
    expect(find(render(overrides), (props) => props.role === "alert")?.children).toContain("不能提交举报")
  })

  it("deduplicates confirmed submissions and retains the request ID on a failed retry", async () => {
    let finish!: (value: { error: string }) => void
    mocks.action.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    find(render(), (props) => props.value === null && Boolean(props.onChange))?.onChange?.(1)
    await button("保存评价").onClick()
    await button("确定").onClick()
    setField("activity-report-detail", "具体情况：对方在活动中多次恶意干扰他人。")
    await button("保存评价并提交举报").onClick()
    const confirm = button("确定")
    await confirm.onClick(); await confirm.onClick()
    expect(mocks.action).toHaveBeenCalledOnce()
    finish({ error: "PEER_FAILED" }); await Promise.resolve()
    await button("保存评价并提交举报").onClick()
    await button("确定").onClick()
    expect(mocks.action).toHaveBeenCalledTimes(2)
    expect(mocks.action.mock.calls[0][0].requestId).toBe(mocks.action.mock.calls[1][0].requestId)
  })
})
