import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { ActivityReviewContext } from "@/lib/activity-reviews/types"

vi.mock("@/app/app/matches/rounds/[roundId]/reviews/actions", () => ({ submitActivityReviewAction: vi.fn() }))
import { ActivityReviewPageContent } from "./ActivityReviewPageContent"
import { ActivityReviewScorePicker } from "./ActivityReviewScorePicker"
import { activityReviewCopy } from "@/lib/activity-reviews/copy"

const context: ActivityReviewContext = {
  roundId: "autumn", title: "秋季迎新派对", status: "open", opensAt: "2026-10-10T08:00:00Z", closesAt: "2026-10-17T08:00:00Z",
  reviewedCount: 2, participantCount: 31, canReview: true, canReport: true, eligible: true,
  settings: { enabled: true, opensAt: "2026-10-10T08:00:00Z", closesAt: "2026-10-17T08:00:00Z", openedAt: "2026-10-10T08:00:00Z", rosterConfirmed: true, version: 1 },
  participants: [{ memberId: "a", fullName: "王小竹", nickname: "竹叶", review: null, report: null }, { memberId: "b", fullName: "王小竹", nickname: "小溪", review: null, report: null }],
  total: 31, page: 1, pageSize: 20, search: "王",
}

describe("event review page content", () => {
  it("renders a scoped search, both identity fields and pagination without requiring all participants to be rated", () => {
    const html = renderToStaticMarkup(createElement(ActivityReviewPageContent, { context, locale: "zh" }))
    expect(html).toContain("王小竹"); expect(html).toContain("竹叶"); expect(html).toContain("小溪")
    expect(html).toContain("不需要评价所有人")
    expect(html).toContain("你已评价 2 位玩家")
    expect(html).toContain('action="/app/matches/rounds/autumn/reviews"')
    expect(html).toContain("page=2&amp;search=%E7%8E%8B")
  })

  it("does not reveal supplied participants to an ineligible page context", () => {
    const html = renderToStaticMarkup(createElement(ActivityReviewPageContent, { context: { ...context, eligible: false }, locale: "zh" }))
    expect(html).not.toContain("王小竹")
    expect(html).not.toContain('role="search"')
    expect(html).toContain("本场互评暂不可用")
  })

  it("renders Japanese labels including half-point choices with no default selection", () => {
    const html = renderToStaticMarkup(createElement(ActivityReviewPageContent, { context, locale: "ja", initialSelectedMemberId: "a" }))
    expect(html).toContain("ニックネーム")
    expect(html).toContain("評価を保存")
    expect(html).toContain("0.5 点刻み")
    expect(html.match(/type="radio"/g)).toHaveLength(9)
    expect(html).not.toContain("checked=\"\"")
  })

  it("uses exactly one checked radio for an existing half-point review", () => {
    const html = renderToStaticMarkup(createElement(ActivityReviewScorePicker, { value: 4.5, onChange: () => {}, copy: activityReviewCopy("zh") }))
    expect(html.match(/checked=""/g)).toHaveLength(1)
    expect(html).toContain('value="4.5"')
  })

  it("retains only the author's read-only records after eligibility is removed without revealing names or moderation notes", () => {
    const removed: ActivityReviewContext = { ...context, eligible: false, canReview: false, canReport: false,
      ownReviews: [{ id: "review-one", revieweeId: "12345678-private-member", score: 4.5, comment: "当时交流很愉快", version: 2, valid: true, updatedAt: "2026-10-10T12:00:00Z" }],
      ownReports: [{ id: "report-one", revieweeId: "12345678-private-member", category: "privacy", detail: "本人已提交的具体情况说明。", status: "reviewing", version: 3, createdAt: "2026-10-10T12:00:00Z", updatedAt: "2026-10-11T12:00:00Z", supplements: [{ detail: "本人补充的相关情况。", createdAt: "2026-10-11T12:00:00Z" }], internalNote: "ADMIN SECRET" }],
    }
    const html = renderToStaticMarkup(createElement(ActivityReviewPageContent, { context: removed, locale: "zh" }))
    expect(html).toContain("本人已提交记录")
    expect(html).toContain("对象编号 · 12345678")
    expect(html).toContain("当时交流很愉快")
    expect(html).toContain("本人已提交的具体情况说明。")
    expect(html).toContain("本人补充的相关情况。")
    expect(html).toContain("处理中")
    expect(html).not.toContain("王小竹")
    expect(html).not.toContain("ADMIN SECRET")
    expect(html).not.toContain("更新评价")
    expect(html).not.toContain("<textarea")
  })

  it("keeps submitted history available when search has no participant matches", () => {
    const html = renderToStaticMarkup(createElement(ActivityReviewPageContent, { context: { ...context, participants: [], total: 0, ownReviews: [{ id: "review", revieweeId: "12345678-member", score: 3.5, comment: "搜索时仍然可见的本人评价", version: 1, valid: true, updatedAt: "2026-10-10T12:00:00Z" }] }, locale: "zh" }))
    expect(html).toContain("没有找到符合条件的玩家")
    expect(html).toContain("搜索时仍然可见的本人评价")
  })
})
