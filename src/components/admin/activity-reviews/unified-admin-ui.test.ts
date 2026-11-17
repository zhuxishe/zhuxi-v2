import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { ActivityReviewSettings, AdminActivityReviewContext } from "@/lib/activity-reviews/types"
import { ActivityReviewRoster } from "./ActivityReviewRoster"
import { ActivityReviewSettingsForm } from "./ActivityReviewSettingsForm"

const settings: ActivityReviewSettings = {
  reviewSystem: "unified", enabled: true, autoIncludeRegistered: false, autoIncludeSupported: false,
  opensAt: "2026-12-01T09:00:00Z", closesAt: "2026-12-08T09:00:00Z", openedAt: null, rosterConfirmed: false, version: 0,
}
const context: AdminActivityReviewContext = {
  roundId: "round-id", title: "新版活动", settings: { ...settings, rosterConfirmed: true, version: 2 },
  participants: [], candidates: [], reviews: [], reports: [], audit: [], canManageSettings: true, canModerateReports: true,
}
const success = async () => ({ success: true })

describe("unified administration copy and boundaries", () => {
  it("can configure unified matching without a manual minimum roster and preserves legacy instructions", () => {
    const props = { roundId: "round-id", settings, canManage: true, saveAction: success }
    const unified = renderToStaticMarkup(createElement(ActivityReviewSettingsForm, props))
    expect(unified).toContain("已正式公布匹配的参与者可确认实际交流后评价")
    expect(unified).not.toContain("请先确认参与名册，再启用互评")
    const legacy = renderToStaticMarkup(createElement(ActivityReviewSettingsForm, { ...props, settings: { ...settings, reviewSystem: "legacy" } }))
    expect(legacy).toContain("请先确认参与名册，再启用互评")
    expect(legacy).not.toContain("本场使用新版统一互评")
  })
  it("separates lateness from removal and keeps explicit cancellation restoration outside the roster form", () => {
    const member = { memberId: "member-id", fullName: "竹友", nickname: null, source: "registered", included: true, eligible: false, registered: false, canRestore: true }
    const html = renderToStaticMarkup(createElement(ActivityReviewRoster, {
      context: { ...context, settings: { ...context.settings, autoIncludeSupported: true, autoIncludeRegistered: true }, participants: [member], candidates: [member] },
      memberOptions: [member], saveAction: success, restoreAction: success,
    }))
    expect(html).toContain("迟到仍算参加")
    expect(html).toContain("已选 1 人")
    expect(html).toContain("可保存 0 人或 1 人")
    expect(html).toContain("报名已取消 · 历史记录保留")
    expect(html).toContain("恢复 竹友 的误取消报名")
    expect(html).toContain("普通保存名单不会恢复报名")
    const firstFormEnd = html.indexOf("</form>")
    expect(html.indexOf("恢复 竹友 的误取消报名")).toBeGreaterThan(firstFormEnd)
    expect(html.match(/<form\b/g)).toHaveLength(2)
  })
})
