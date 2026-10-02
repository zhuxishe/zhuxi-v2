import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { ActivityReview, AdminActivityReviewContext, AdminActivityReviewsData } from "@/lib/activity-reviews/types"
import { ActivityReviewModeration, filterAdminReviews } from "./ActivityReviewModeration"
import { ActivityReviewRoster } from "./ActivityReviewRoster"
import { ActivityReviewSettingsForm } from "./ActivityReviewSettingsForm"
import { ActivityReviewsDashboard, type AdminActivityReviewActions } from "./ActivityReviewsDashboard"
import { adminReviewErrorMessage, ReviewHistory } from "./shared"
import { RoundActivityReviewSummary } from "./RoundActivityReviewSummary"

const members = [
  { memberId: "member-a", fullName: "林秋", nickname: "小秋" },
  { memberId: "member-b", fullName: "林秋", nickname: "竹叶" },
  { memberId: "member-c", fullName: "王夏", nickname: null },
]
const reviews: ActivityReview[] = [
  { id: "review-1", reviewerId: "member-a", revieweeId: "member-b", score: 4.5, comment: "很会照顾第一次参加的玩家", version: 3, valid: true, updatedAt: "2026-10-03T09:00:00Z" },
  { id: "review-2", reviewerId: "member-c", revieweeId: "member-a", score: 2, comment: "没有交流", version: 2, valid: false, updatedAt: "2026-10-03T09:30:00Z" },
]
const context: AdminActivityReviewContext = {
  roundId: "round-a", title: "秋季迎新派对",
  settings: { enabled: false, opensAt: "2026-10-03T06:00:00Z", closesAt: "2026-10-10T14:00:00Z", openedAt: null, rosterConfirmed: true, version: 2 },
  participants: members.slice(0, 2).map((member) => ({ ...member, source: "registration", included: true, registered: true, eligible: true })),
  candidates: members.slice(0, 2).map((member) => ({ ...member, source: "registration", included: true, registered: true, eligible: true })),
  reviews,
  reports: [{ id: "report-1", reporterId: "member-a", revieweeId: "member-b", category: "privacy", detail: "PRIVATE_REPORT_DETAIL", status: "pending", version: 1, createdAt: "2026-10-03T09:00:00Z", updatedAt: "2026-10-03T09:00:00Z", supplements: [{ detail: "PRIVATE_SUPPLEMENT", createdAt: "2026-10-03T10:00:00Z" }], internalNote: "PRIVATE_INTERNAL_NOTE" }],
  audit: [{ id: "audit-1", action: "moderate_report", actorId: "admin-private", reason: "PRIVATE_AUDIT_REASON", createdAt: "2026-10-03T11:00:00Z", reportId: "report-1" }],
  canManageSettings: true, canModerateReports: true,
}
const success = async () => ({ success: true })
const actions: AdminActivityReviewActions = { saveSettingsAction: success, confirmRosterAction: success, moderateReviewAction: success, moderateReportAction: success }
const data: AdminActivityReviewsData = { events: [], context, memberOptions: members, setupRequired: false, memberFilter: null }

describe("activity review administration UI", () => {
  it("does not render report details, supplements or internal audit to an unauthorized report viewer", () => {
    const html = renderToStaticMarkup(createElement(ActivityReviewModeration, { context: { ...context, canModerateReports: false }, memberOptions: members, memberFilter: null, moderateReviewAction: success, moderateReportAction: success }))
    for (const privateText of ["PRIVATE_REPORT_DETAIL", "PRIVATE_SUPPLEMENT", "PRIVATE_INTERNAL_NOTE", "PRIVATE_AUDIT_REASON"]) expect(html).not.toContain(privateText)
    expect(html).toContain("当前权限无法查看活动举报明细")
    expect(html).toContain("4.5")
  })

  it("shows both names and nicknames to distinguish matching real names", () => {
    const html = renderToStaticMarkup(createElement(ActivityReviewRoster, { context, memberOptions: members, saveAction: success }))
    expect(html).toContain("小秋")
    expect(html).toContain("竹叶")
    expect(html).toContain("已选 2 人")
    expect(html).toContain("补录实际到场成员")
  })

  it("searches the full collection before pagination, including nickname and review validity", () => {
    const names = new Map(members.map((member) => [member.memberId, member]))
    expect(filterAdminReviews(reviews, names, "竹叶", "all", null).map((review) => review.id)).toEqual(["review-1"])
    expect(filterAdminReviews(reviews, names, "", "invalid", "member-a").map((review) => review.id)).toEqual(["review-2"])
    expect(filterAdminReviews(reviews, names, "", "all", "member-b").map((review) => review.id)).toEqual(["review-1"])
  })

  it("blocks roster confirmation before the first settings save", () => {
    const html = renderToStaticMarkup(createElement(ActivityReviewRoster, { context: { ...context, settings: { ...context.settings, version: 0, rosterConfirmed: false } }, memberOptions: members, saveAction: success }))
    expect(html).toContain("请先在开放设置中保存时间")
    expect(html).toMatch(/<fieldset disabled/)
    expect(html).toMatch(/<button type="submit" disabled/)
  })

  it("formats datetime controls as Japan time and requires a reason before saving", () => {
    const html = renderToStaticMarkup(createElement(ActivityReviewSettingsForm, { roundId: context.roundId, settings: context.settings, canManage: true, saveAction: success }))
    expect(html).toContain('value="2026-10-03T15:00"')
    expect(html).toContain('value="2026-10-10T23:00"')
    expect(html).toMatch(/<button type="submit" disabled/)
    expect(html).toContain("4–500")
  })

  it("provides no submission forms when the database is unavailable", () => {
    const html = renderToStaticMarkup(createElement(ActivityReviewsDashboard, { data: { ...data, setupRequired: true }, actions, onNavigate: () => {} }))
    expect(html).toContain("数据迁移尚未就绪")
    expect(html).not.toContain("<form")
    expect(html).not.toContain("PRIVATE_REPORT_DETAIL")
  })

  it("tells admins how to recover from concurrent changes without printing raw error codes", () => {
    const message = adminReviewErrorMessage("PEER_VERSION_CONFLICT")
    expect(message).toContain("输入已保留")
    expect(message).toContain("刷新核对")
    expect(message).not.toContain("PEER_")
  })

  it("round overview carries only aggregate counts and the scoped administration entry", () => {
    const html = renderToStaticMarkup(createElement(RoundActivityReviewSummary, { roundId: "round-a", summary: null }))
    expect(html).toContain("/admin/activity-reviews?roundId=round-a")
    expect(html).toContain("待配置")
    expect(html).not.toContain("PRIVATE_")
  })

  it("labels audit actions in Chinese and distinguishes players from administrators", () => {
    const html = renderToStaticMarkup(createElement(ReviewHistory, { entries: [
      { id: "player-history", action: "review_created", actorId: "player-one", actorKind: "player", reason: "", createdAt: "2026-10-03T09:00:00Z" },
      { id: "admin-history", action: "review_moderated", actorId: "admin-one", actorKind: "admin", reason: "核对实际活动记录", createdAt: "2026-10-03T10:00:00Z" },
      { id: "system-history", action: "review_invalidated_roster", actorId: null, actorKind: "system", reason: "名册变更", createdAt: "2026-10-03T11:00:00Z" },
    ] }))
    expect(html).toContain("提交评分")
    expect(html).toContain("审核评分有效性")
    expect(html).toContain("因名册调整标记评分无效")
    expect(html).toContain("玩家 player-o")
    expect(html).toContain("管理员 admin-on")
    expect(html).not.toContain("管理员 player-o")
    expect(html).not.toContain("review_created")
  })
})
