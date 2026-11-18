import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { PeerScoreDirectory } from "./PeerScoreDirectory"
import { normalizePeerScoreDirectoryControls } from "@/lib/member-master/peer-score-directory-controls"
import type { MemberPeerScoreDirectory } from "@/types/member-peer-score-directory"

const controls = normalizePeerScoreDirectoryControls()
const data: MemberPeerScoreDirectory = {
  members: [
    { memberId: "rated", fullName: "林秋", nickname: "竹叶", memberNumber: "101", score: 4.5, reviewerCount: 2, activityCount: 3, reviewCount: 4, latestReviewAt: "2026-11-18T03:00:00Z", sampleStatus: "ready" },
    { memberId: "unrated", fullName: "新成员", nickname: null, memberNumber: "102", score: null, reviewerCount: 0, activityCount: 0, reviewCount: 0, latestReviewAt: null, sampleStatus: "unrated" },
  ], total: 2, page: 1, pageSize: 30, sort: "latest_review_at", direction: "desc", sampleStatus: "all", canViewMemberNumber: true,
}

describe("peer score directory presentation", () => {
  it("shows aligned desktop rows and compact mobile entries with one discoverable detail link per member", () => {
    const html = renderToStaticMarkup(createElement(PeerScoreDirectory, { result: { status: "ready", data }, controls, canSearchMemberNumber: true }))
    expect(html).toContain("林秋")
    expect(html).toContain("新成员")
    expect(html).toContain("4.5")
    expect(html).toContain("暂无有效评分")
    expect(html).toContain("样本达标")
    expect(html).toContain("达标不会自动公开")
    expect(html).toContain("会员端原有合拍分保持不变")
    expect(html).toContain("2026-11-18 12:00")
    expect(html).toContain('href="/admin/peer-scores/rated"')
    expect(html.match(/href="\/admin\/peer-scores\/rated"/g)).toHaveLength(1)
    expect(html).toContain('aria-label="查看林秋的合拍分数详情"')
    expect(html).toContain("lg:grid-cols-[minmax(0,1.5fr)_3.5rem_3rem_3rem_3rem_6.5rem_8rem]")
    expect(html).toContain("有效条数")
    expect(html).not.toContain("活动体验的长期记录")
    expect(html).not.toContain("lg:grid-cols-2")
    expect(html).toMatch(/maxlength="100"/i)
    expect(html).not.toContain("5.0")
    expect(html).not.toMatch(/<table|overflow-x-auto|min-w-\[/)
    expect(html).toContain('method="get"')
    expect(html).toContain('value="latest_review_at" selected=""')
    expect(html).not.toContain('name="page"')
  })
  it("hides member numbers and number-search promises for ordinary administrators", () => {
    const safeData = { ...data, canViewMemberNumber: false, members: data.members.map((member) => ({ ...member, memberNumber: null })) }
    const html = renderToStaticMarkup(createElement(PeerScoreDirectory, { result: { status: "ready", data: safeData }, controls, canSearchMemberNumber: false }))
    expect(html).not.toContain("会员编号")
    expect(html).toContain('placeholder="姓名或昵称"')
  })
  it("keeps filters on pagination links and uses wrapping controls for narrow screens", () => {
    const selected = normalizePeerScoreDirectoryControls({ search: "林秋", status: "ready", sort: "score", page: "2" })
    const html = renderToStaticMarkup(createElement(PeerScoreDirectory, { result: { status: "ready", data: { ...data, total: 90, page: 2 } }, controls: selected, canSearchMemberNumber: true }))
    expect(html).toContain("第 2 / 3 页")
    expect(html).toContain('href="/admin/peer-scores?search=%E6%9E%97%E7%A7%8B&amp;status=ready&amp;sort=score&amp;page=3"')
    expect(html).toContain('aria-label="合拍分数名单分页"')
  })
  it("never presents failed or undeployed reads as an empty member directory", () => {
    for (const status of ["unavailable", "error"] as const) {
      const html = renderToStaticMarkup(createElement(PeerScoreDirectory, { result: { status }, controls, canSearchMemberNumber: false }))
      expect(html).toContain(status === "error" ? "读取失败" : "暂未配置")
      expect(html).not.toContain("没有符合条件的成员")
      expect(html).not.toContain("共 <strong")
    }
  })
})
