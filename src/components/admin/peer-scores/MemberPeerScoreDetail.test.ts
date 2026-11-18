import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
import { MemberPeerScoreDetail, memberPeerScoreDetailHref } from "./MemberPeerScoreDetail"
import { normalizeMemberPeerScoreDetail } from "@/lib/queries/member-peer-score-detail"
import { detailMemberId, detailRoundIds, memberPeerScoreDetailFixture } from "@/lib/queries/__fixtures__/member-peer-score-detail"

function fixture() { return normalizeMemberPeerScoreDetail(memberPeerScoreDetailFixture(), detailMemberId) }
const render = (data = fixture()) => renderToStaticMarkup(createElement(MemberPeerScoreDetail, { data }))

describe("member peer-score detail display", () => {
  it("separates the trial score from the currently published operational score and preserves player comments", () => {
    const html = render()
    expect(html).toContain("林青"); expect(html).toContain("竹叶"); expect(html).toContain("ZX001")
    expect(html).toContain("3.8 / 5"); expect(html).toContain("4.9 / 5")
    expect(html).toContain("会员端当前显示"); expect(html).toContain("后台试算")
    expect(html).toContain("交流时很照顾新成员。")
    expect(html).toContain("指标发布人"); expect(html).toContain("管理员甲")
    expect(html).toContain("指标最近修改人"); expect(html).toContain("管理员乙")
    expect(html).not.toContain("备注作者")
    expect(html).toContain("最近收到有效评分")
    expect(html).toContain("2026-11-16 19:00")
  })

  it("shows full-history reviewer means even when the current page contains one different score", () => {
    const data = fixture()
    data.reviews = data.reviews.slice(0, 1); data.filters.pageSize = 1
    const html = render(data)
    expect(html).toContain("4.50 / 5")
    expect(html).toContain("2 条有效评价 · 2 场活动")
    expect(html).toContain("本页 1 条")
    expect(html).toContain(`href="/admin/peer-scores/${detailMemberId}?page=2"`)
    expect(html).not.toContain("5.00 / 5")
  })

  it("includes associated activities without ratings and distinguishes cancelled signup from roster inclusion", () => {
    const html = render()
    expect(html).toContain("尚未收到评价的活动")
    expect(html).toContain("本场暂无有效评价")
    expect(html).toContain("报名已取消")
    expect(html).toContain("列入互评名册")
    expect(html).toContain(`/admin/matching/rounds/${detailRoundIds[3]}`)
    expect(html).toContain(`/admin/peer-scores/${detailMemberId}?roundId=${detailRoundIds[3]}`)
    expect(html).toContain(`/admin/members/${detailMemberId}?tab=activity`)
  })

  it("shows invalid reasons and routes moderation to the original activity without rendering report payloads", () => {
    const data = fixture()
    data.filters.validity = "invalid"; data.reviews = [{ ...data.reviews[0], valid: false, invalidationReason: "确认未实际交流", invalidatedAt: "2026-11-17T10:00:00Z" }]; data.total = 1
    const html = render({ ...data, reports: [{ detail: "PRIVATE REPORT" }] } as typeof data)
    expect(html).toContain("无效 · 不计分")
    expect(html).toContain("确认未实际交流")
    expect(html).toContain(`/admin/activity-reviews?roundId=${detailRoundIds[0]}&amp;memberId=${detailMemberId}`)
    expect(html).not.toContain("PRIVATE REPORT")
  })

  it("shows pending operational values accurately and hides a member number without permission", () => {
    const data = fixture()
    data.canViewMemberNumber = false
    data.operationalScore = { ...data.operationalScore!, status: "pending", publishedAt: null, publishedByName: null, updatedByName: null }
    const html = render(data)
    expect(html).not.toContain("ZX001")
    expect(html).toContain("待评估")
    expect(html).toContain("后台保存的运营分")
    expect(html).not.toContain("管理员甲")
    expect(html).not.toContain("管理员乙")
  })

  it("distinguishes no effective score from no records matching the current activity filter", () => {
    const data = fixture()
    data.reviews = []; data.total = 0; data.filters.roundId = detailRoundIds[3]
    expect(render(data)).toContain("当前筛选条件下没有评价记录")
    data.filters.roundId = null
    data.summary = { score: null, reviewerCount: 0, activityCount: 0, reviewCount: 0, eligibleForPublication: false, latestReviewAt: null, sampleStatus: "unrated" }
    data.reviewers = []; data.operationalScore = null
    const html = render(data)
    expect(html).toContain("该成员暂无有效单项评价")
    expect(html).toContain("尚无运营分记录")
    expect(html).not.toContain("读取失败")
  })

  it("preserves server filter parameters across pagination and escapes comment text", () => {
    const data = fixture()
    const filters = { ...data.filters, validity: "all" as const, roundId: detailRoundIds[0], page: 2 }
    expect(memberPeerScoreDetailHref(detailMemberId, filters)).toBe(`/admin/peer-scores/${detailMemberId}?validity=all&roundId=${detailRoundIds[0]}&page=2`)
    data.reviews[0].comment = "<script>alert('no')</script>"
    expect(render(data)).not.toContain("<script>")
    expect(render(data)).toContain("&lt;script&gt;")
  })
})
