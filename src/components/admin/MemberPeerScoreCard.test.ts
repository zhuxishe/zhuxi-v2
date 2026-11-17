import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { MemberPeerScoreCard } from "./MemberPeerScoreCard"
import type { MemberPeerScore } from "@/types/member-peer-score"

const data: MemberPeerScore = {
  member_id: "member-id", score: 4.3, reviewer_count: 2, activity_count: 3, review_count: 4, eligible_for_publication: true,
  sources: [{ reviewer_id: "reviewer-id", reviewer_name: "竹友", score: 4.166666667, review_count: 3, activity_count: 3,
    reviews: [
      { review_id: "review-id", round_id: "round-id", round_name: "迎新派对", score: 4.5, updated_at: "2026-10-10T12:00:00Z" },
      { review_id: "review-2", round_id: "round-2", round_name: "周末活动", score: 4, updated_at: "2026-10-17T12:00:00Z" },
      { review_id: "review-3", round_id: "round-3", round_name: "交流活动", score: 4, updated_at: "2026-10-24T12:00:00Z" },
    ] },
    { reviewer_id: "reviewer-2", reviewer_name: "另一位竹友", score: 4.5, review_count: 1, activity_count: 1,
      reviews: [{ review_id: "review-4", round_id: "round-id", round_name: "迎新派对", score: 4.5, updated_at: "2026-10-10T12:00:00Z" }] },
  ],
}

describe("member peer score trial card", () => {
  it("clearly separates a qualified trial from public profile scores and exposes read-only provenance", () => {
    const html = renderToStaticMarkup(createElement(MemberPeerScoreCard, { result: { status: "ready", data } }))
    expect(html).toContain("长期合拍分（后台试算）")
    expect(html).toContain("4.3 / 5")
    expect(html).toContain("2 人")
    expect(html).toContain("3 场")
    expect(html).toContain("4 条")
    expect(html).toContain("不会自动公开")
    expect(html).toContain("不改变会员端合拍分或匹配算法")
    expect(html).toContain("4.17")
    expect(html).toContain("迎新派对")
    expect(html).toContain("2026-10-10 21:00")
    expect(html).toContain("/admin/activity-reviews?roundId=round-id&amp;memberId=member-id")
    expect(html).not.toMatch(/<(input|form|button)\b/)
  })

  it("keeps a genuine no-review state distinct from a default 5 and from query failures", () => {
    const html = renderToStaticMarkup(createElement(MemberPeerScoreCard, { result: { status: "ready", data: {
      ...data, score: null, reviewer_count: 0, activity_count: 0, review_count: 0, eligible_for_publication: false, sources: [],
    } } }))
    expect(html).toContain("暂无有效评分")
    expect(html).toContain("0 人")
    expect(html).toContain("尚未满足")
    expect(html).not.toContain("5.0 / 5")
    expect(html).not.toContain("查看评分来源")
    for (const status of ["error", "unavailable", "loading"] as const) {
      const stateHtml = renderToStaticMarkup(createElement(MemberPeerScoreCard, { result: { status } }))
      expect(stateHtml).not.toContain("0 人")
      expect(stateHtml).not.toContain("暂无有效评分")
      expect(stateHtml).toContain(status === "error" ? "读取失败" : status === "unavailable" ? "暂未配置" : "正在读取")
    }
  })
})
