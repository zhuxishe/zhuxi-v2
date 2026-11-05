import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ActivityReviewContext } from "@/lib/activity-reviews/types"

const mocks = vi.hoisted(() => ({ useState: vi.fn() }))
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: mocks.useState }))
vi.mock("@/app/app/matches/rounds/[roundId]/reviews/actions", () => ({ submitActivityReviewAction: vi.fn() }))
import { ActivityReviewPageContent } from "./ActivityReviewPageContent"
import { ActivityReviewEditor } from "./ActivityReviewEditor"
import { ReviewRegistrationReturn } from "../ReviewRegistrationReturn"

type Props = { children?: ReactNode }
function find<P>(node: ReactNode, type: unknown): P | undefined {
  if (Array.isArray(node)) return node.map((child) => find<P>(child, type)).find(Boolean)
  if (!isValidElement<Props>(node)) return
  return node.type === type ? node.props as P : find<P>(node.props.children, type)
}
const context: ActivityReviewContext = {
  roundId: "30000000-0000-0000-0000-000000000001", title: "活动 B", status: "closed",
  opensAt: "2026-11-14T08:00:00Z", closesAt: "2026-11-15T08:00:00Z", reviewRequired: true, lateReview: true,
  reviewedCount: 0, participantCount: 2, canReview: true, canReport: true, eligible: true,
  settings: { enabled: true, opensAt: "2026-11-14T08:00:00Z", closesAt: "2026-11-15T08:00:00Z", openedAt: "2026-11-14T08:00:00Z", rosterConfirmed: true, version: 1 },
  participants: [{ memberId: "partner", fullName: "小竹", nickname: null, review: null, report: null }],
  ownReviews: [], ownReports: [], total: 1, page: 1, pageSize: 24, search: "",
}
let states: unknown[], cursor: number
function render() {
  cursor = 0
  return ActivityReviewPageContent({ context, locale: "zh", initialSelectedMemberId: "partner",
    registrationReturn: { roundId: "30000000-0000-0000-0000-000000000002", fromParticipation: false } })
}
function editor(tree: ReactNode) {
  const result = find<Parameters<typeof ActivityReviewEditor>[0]>(tree, ActivityReviewEditor)
  if (!result) throw new Error("Missing review editor")
  return result
}

describe("late review completion and return to registration", () => {
  beforeEach(() => {
    states = []
    mocks.useState.mockImplementation((initial: unknown) => {
      const index = cursor++
      if (!(index in states)) states[index] = initial
      return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value }]
    })
  })

  it("stops further late scores immediately after one saved score while keeping reports and a rechecked return", () => {
    expect(editor(render()).canReview).toBe(true)
    editor(render()).onSaved?.({ success: true, review: {
      id: "review", revieweeId: "partner", score: 4.5, comment: "", version: 1, valid: true, updatedAt: "2026-11-20T00:00:00Z",
    } })
    const tree = render()
    expect(editor(tree).canReview).toBe(false)
    expect(editor(tree).canReport).toBe(true)
    expect(find<Parameters<typeof ReviewRegistrationReturn>[0]>(tree, ReviewRegistrationReturn)?.completed).toBe(true)
  })

  it("does not mark a report-only save as completed or consume the late rating opportunity", () => {
    editor(render()).onSaved?.({ success: true, report: {
      id: "report", revieweeId: "partner", category: "other", detail: "具体情况说明。", status: "pending", version: 1,
      createdAt: "2026-11-20T00:00:00Z", updatedAt: "2026-11-20T00:00:00Z", supplements: [],
    } })
    const tree = render()
    expect(editor(tree).canReview).toBe(true)
    expect(find<Parameters<typeof ReviewRegistrationReturn>[0]>(tree, ReviewRegistrationReturn)?.completed).toBe(false)
  })
})
