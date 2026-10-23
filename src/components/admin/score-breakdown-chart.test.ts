import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ScoreBreakdownChart } from "./ScoreBreakdownChart"

const factor = (name: string, weight: number, rawScore: number) => ({ factor: name, label: name, weight, rawScore, weightedScore: weight * rawScore })
const render = (breakdown: unknown) => renderToStaticMarkup(createElement(ScoreBreakdownChart, { breakdown }))

describe("versioned administrator score explanations", () => {
  it("keeps both historical object and array breakdowns readable", () => {
    expect(render({ interest_overlap: { raw: 0.5, weighted: 7.5, maxRaw: 15 } })).toContain("7.5")
    expect(render([factor("personality_compatibility", 25, 0.8)])).toContain("20.0")
    expect(render([factor("compatibility_score", 0, 0.8)])).toContain("无分解数据")
    expect(render(null)).toContain("无分解数据")
  })

  it("separates the 100 point base, old history adjustment and actual final score", () => {
    const html = render([
      factor("interest_overlap", 25, 0.8), factor("activity_feedback", 10, 0.5),
      { factor: "history_adjustment", weight: 0, rawScore: -20, weightedScore: -20 },
    ])
    expect(html).toContain("基础分 25.0 / 100")
    expect(html).toContain("旧历史调整 -20.0")
    expect(html).toContain("最终 5.0")
    expect(html).toContain("活动互评")
    expect(html).not.toContain("width:-")
    expect(html).not.toContain("NaN")
  })

  it("does not cap or hide an existing reunion bonus above the 100 point base", () => {
    const html = render([factor("activity_feedback", 10, 1), { factor: "history_adjustment", weight: 0, rawScore: 30, weightedScore: 30 }])
    expect(html).toContain("旧历史调整 +30.0")
    expect(html).toContain("最终 40.0")
  })

  it("reads the single pool summary without treating metadata as score factors", () => {
    const html = render({ kind: "multi_pool", version: "weighted_feedback:1", factors: [factor("activity_feedback", 10, 0.5), factor("interest_overlap", 25, 0.8)], pairCount: 21, feedbackPairCount: 3, minimumMemberAverage: 31.25,
      memberAverageDistribution: { min: 31.25, max: 70, mean: 55 }, historyAdjustment: 0,
    })
    expect(html).toContain("整池两两平均")
    expect(html).toContain("21 对成员关系")
    expect(html).toContain("其中 3 对有活动互评")
    expect(html).toContain("最低成员平均分 31.3")
    expect(html).toContain("不额外加减重逢或普通重复分")
    expect(html).not.toContain("未识别的评分因素")
    expect(html).not.toContain("NaN")
  })

  it("handles malformed or partial historical data without crashing the results page", () => {
    expect(render({ metadata: "old", invalid: { raw: 0.5, weighted: null, maxRaw: 15 } })).toContain("无分解数据")
    expect(render([null, {}, { factor: "a", weight: 1, rawScore: 0.5, weightedScore: Infinity }])).toContain("无分解数据")
  })
})
