import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ActivityReviewContext } from "@/lib/activity-reviews/types"

const mocks = vi.hoisted(() => ({ useState: vi.fn(), action: vi.fn() }))
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: mocks.useState }))
vi.mock("@/app/app/matches/rounds/[roundId]/reviews/actions", () => ({ submitActivityReviewAction: mocks.action }))
import { ActivityReviewPageContent } from "./ActivityReviewPageContent"
import { ActivityReviewHistory } from "./ActivityReviewHistory"
import { ActivityReviewEditor } from "./ActivityReviewEditor"

type NodeProps = { children?: ReactNode; onClick?: () => void; disabled?: boolean }
function findProps<P>(node: ReactNode, component: unknown): P | undefined {
  if (Array.isArray(node)) return node.map((child) => findProps<P>(child, component)).find(Boolean)
  if (!isValidElement<NodeProps>(node)) return
  return node.type === component ? node.props as P : findProps<P>(node.props.children, component)
}
function findButton(node: ReactNode, label: string): NodeProps | undefined {
  if (Array.isArray(node)) return node.map((child) => findButton(child, label)).find(Boolean)
  if (!isValidElement<NodeProps>(node)) return
  return node.props.onClick && node.props.children === label ? node.props : findButton(node.props.children, label)
}
function textContent(node: ReactNode): string {
  if (typeof node === "string") return node
  if (Array.isArray(node)) return node.map(textContent).join("")
  return isValidElement<NodeProps>(node) ? textContent(node.props.children) : ""
}
type HistoryProps = Parameters<typeof ActivityReviewHistory>[0]
type EditorProps = Parameters<typeof ActivityReviewEditor>[0]
const review = { id: "review", revieweeId: "off-page-member", score: 4.5, comment: "已保存的评论", version: 2, valid: true, updatedAt: "2026-10-10T12:00:00Z" }
const report = { id: "report", revieweeId: "off-page-member", category: "privacy" as const, detail: "本人已提交的具体举报说明。", status: "pending" as const, version: 3, createdAt: "2026-10-10T12:00:00Z", updatedAt: "2026-10-10T12:00:00Z", supplements: [] }
const context: ActivityReviewContext = {
  roundId: "autumn", title: "秋季迎新派对", status: "open", opensAt: "2026-10-10T08:00:00Z", closesAt: "2026-10-17T08:00:00Z",
  reviewedCount: 1, participantCount: 31, canReview: true, canReport: true, eligible: true,
  settings: { enabled: true, opensAt: "2026-10-10T08:00:00Z", closesAt: "2026-10-17T08:00:00Z", openedAt: "2026-10-10T08:00:00Z", rosterConfirmed: true, version: 1 },
  participants: [], ownReviews: [review], ownReports: [report],
  historyTargets: [{ memberId: "off-page-member", fullName: "林青", nickname: "竹叶", canReview: true, canReport: true }],
  total: 0, page: 2, pageSize: 24, search: "不会匹配的搜索词",
}
let states: unknown[], cursor: number
function render(value = context) {
  cursor = 0
  return ActivityReviewPageContent({ context: value, locale: "zh", action: mocks.action })
}
function history(tree: ReactNode) {
  const props = findProps<HistoryProps>(tree, ActivityReviewHistory)
  if (!props) throw new Error("History is missing")
  return props
}
function editor(tree: ReactNode) {
  const props = findProps<EditorProps>(tree, ActivityReviewEditor)
  if (!props) throw new Error("Editor is missing")
  return props
}
function edit(label: string, value = context) {
  const button = findButton(ActivityReviewHistory(history(render(value))), label)
  if (!button?.onClick) throw new Error(`Missing action: ${label}`)
  button.onClick()
  return editor(render(value))
}

describe("activity review history editing", () => {
  beforeEach(() => {
    vi.clearAllMocks(); states = []
    mocks.useState.mockImplementation((initial: unknown) => {
      const index = cursor++
      if (!(index in states)) states[index] = initial
      return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value }]
    })
  })

  it("opens a saved review outside the current search and page, then updates the record immediately", () => {
    const opened = edit("修改评价")
    expect(opened.mode).toBe("review")
    expect(opened.participant).toMatchObject({ memberId: "off-page-member", fullName: "林青", nickname: "竹叶", review, report })
    expect(opened.draft).toBeUndefined()
    opened.onSaved?.({ success: true, review: { ...review, score: 3.5, comment: "修改后保存的评论", version: 3 } })
    const tree = render()
    expect(findProps<EditorProps>(tree, ActivityReviewEditor)).toBeUndefined()
    expect(history(tree).reviews[0]).toMatchObject({ score: 3.5, comment: "修改后保存的评论", version: 3 })
    expect(history(tree).reports[0]).toEqual(report)
    expect(edit("修改评价").participant.review?.comment).toBe("修改后保存的评论")
    expect(context.ownReviews?.[0].comment).toBe("已保存的评论")
  })

  it("cancels without saving and reopens the persisted report rather than a cancelled draft", () => {
    const opened = edit("修改举报")
    expect(opened.mode).toBe("report")
    expect(opened.participant.report).toEqual(report)
    expect(opened.onDraftChange).toBeUndefined()
    opened.onCancel?.()
    expect(findProps<EditorProps>(render(), ActivityReviewEditor)).toBeUndefined()
    expect(mocks.action).not.toHaveBeenCalled()
    expect(edit("修改举报").participant.report).toEqual(report)
  })

  it("keeps the historical review editor open after report-only submission and reports the actual result", () => {
    const value = { ...context, ownReports: [] }
    const opened = edit("修改评价", value)
    opened.onSaved?.({ success: true, report })
    const tree = render(value)
    expect(editor(tree).mode).toBe("review")
    expect(editor(tree).participant.review).toEqual(review)
    expect(editor(tree).participant.report).toEqual(report)
    expect(history(tree).reviews[0]).toEqual(review)
    expect(textContent(tree)).toContain("举报已提交")
    expect(textContent(tree)).not.toContain("评价已更新")
  })

  it("keeps report and review changes independent in both the history and the next editor", () => {
    const opened = edit("修改举报")
    opened.onSaved?.({ success: true, report: { ...report, category: "other", detail: "已更正并成功保存的举报说明。", version: 4 } })
    expect(history(render()).reports[0]).toMatchObject({ category: "other", detail: "已更正并成功保存的举报说明。", version: 4 })
    expect(history(render()).reviews[0]).toEqual(review)
    expect(edit("修改评价").participant.report?.version).toBe(4)
  })

  it("blocks cancelling or switching the history target while a save is in progress", () => {
    const opened = edit("修改评价")
    opened.onBusyChange?.(true)
    let tree = render()
    expect(history(tree).busy).toBe(true)
    editor(tree).onCancel?.()
    history(tree).onEdit?.("off-page-member", "report")
    tree = render()
    expect(editor(tree).mode).toBe("review")
    editor(tree).onBusyChange?.(false)
    editor(render()).onCancel?.()
    expect(findProps<EditorProps>(render(), ActivityReviewEditor)).toBeUndefined()
  })

  it("leaves reports editable after scoring closes while hiding invalidated or ineligible review actions", () => {
    const closed = { ...context, canReview: false, status: "closed" as const, ownReports: [{ ...report, status: "resolved" as const }] }
    const tree = ActivityReviewHistory(history(render(closed)))
    expect(findButton(tree, "修改评价")).toBeUndefined()
    expect(findButton(tree, "补充或更正")).toBeDefined()
    expect(edit("补充或更正", closed).canReview).toBe(false)
    states = []
    const invalid = { ...context, ownReviews: [{ ...review, valid: false }] }
    expect(findButton(ActivityReviewHistory(history(render(invalid))), "修改评价")).toBeUndefined()
    states = []
    const removed = { ...context, eligible: false }
    const props = history(render(removed))
    expect(props.targets).toEqual([])
    props.onEdit?.("off-page-member", "review")
    expect(findProps<EditorProps>(render(removed), ActivityReviewEditor)).toBeUndefined()
  })

  it("includes a newly submitted player's identity before a server refresh supplies history targets", () => {
    const fresh = { ...context, ownReviews: [], ownReports: [], historyTargets: [], participants: [{ memberId: "fresh", fullName: "新玩家", nickname: null, review: null, report: null }], reviewedCount: 0 }
    cursor = 0
    const tree = ActivityReviewPageContent({ context: fresh, locale: "zh", initialSelectedMemberId: "fresh" })
    editor(tree).onSaved?.({ success: true, review: { ...review, revieweeId: "fresh" } })
    const result = history(render(fresh))
    expect(result.reviews[0].revieweeId).toBe("fresh")
    expect(result.targets?.find((target) => target.memberId === "fresh")?.fullName).toBe("新玩家")
  })
})
