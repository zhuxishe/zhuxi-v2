import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { MatchingEligibilityCard } from "./MatchingEligibilityCard"
import type { MatchingEligibilitySummary } from "@/lib/matching/run-lifecycle"

const summary: MatchingEligibilitySummary = {
  round_id: "round", checked_at: "2026-10-24T01:00:00Z", submitted_count: 23, eligible_count: 2,
  excluded_count: 21, exclusion_summary: [{ reason: "unbound", count: 18 }, { reason: "profile_incomplete", count: 21 }],
}
const render = (value: MatchingEligibilitySummary | null) => renderToStaticMarkup(createElement(MatchingEligibilityCard, {
  summary: value, loading: false, onRefresh: vi.fn(),
}))

describe("pre-run eligibility explanation", () => {
  it("separates saved submissions, eligible members and overlapping exclusion reasons", () => {
    const html = render(summary)
    expect(html).toContain("已保存报名 <strong>23</strong> 人")
    expect(html).toContain("符合资格 <strong>2</strong> 人")
    expect(html).toContain("未通过 <strong>21</strong> 人")
    expect(html).toContain("未绑定账号 18 人")
    expect(html).toContain("必需资料不完整 21 人")
    expect(html).toContain("不能将原因人数相加")
    expect(html).toContain("实际运行会重新核对")
    expect(html).toContain("收集报名继续进行")
    expect(html).toContain("刷新资格")
  })

  it("does not turn an unknown count into a zero-person conclusion", () => {
    const html = render(null)
    expect(html).toContain("不能据此判断是否有人符合资格")
    expect(html).not.toContain("<strong>0</strong>")
    expect(html).not.toContain("不足 2 人")
  })

  it("explains insufficient eligibility without implying saved registrations were removed", () => {
    const html = render({ ...summary, eligible_count: 0, excluded_count: 23 })
    expect(html).toContain("当前符合资格不足 2 人")
    expect(html).toContain("原报名保留")
    expect(html).toContain("已有批次仍按原输入处理")
  })
})
