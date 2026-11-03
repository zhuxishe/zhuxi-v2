// @vitest-environment jsdom
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it } from "vitest"
import { summarizeRoundStats } from "@/lib/matching/round-stats"
import { RoundStatsPanel } from "./RoundStatsPanel"

afterEach(() => { document.body.innerHTML = "" })
function render(submissions: Parameters<typeof summarizeRoundStats>[0]) {
  document.body.innerHTML = renderToStaticMarkup(createElement(RoundStatsPanel, {
    stats: summarizeRoundStats(submissions), activityStart: "2026-11-04", activityEnd: "2026-11-06",
  }))
}
const submission = (gender: string | null, gender_pref: string | null) => ({ gender_pref, game_type_pref: "都可以", member: { member_identity: { gender } }, availability: { "2026-11-04": ["下午"] } })

describe("round registration gender summary", () => {
  it("keeps the existing counts and independently shows personal gender and partner preference", () => {
    render([submission("male", "女"), submission("female", "男"), submission("female", "都可以"), submission("other", null)])
    for (const name of ["总报名：4人", "双人：0人", "多人：0人", "都可以：4人", "男生：1人", "女生：2人"]) {
      expect(document.querySelector(`[role="group"][aria-label="${name}"]`)).not.toBeNull()
    }
    const legend = document.querySelector('[aria-label="搭档性别倾向明细"]')!
    expect([...legend.querySelectorAll("li")].map((row) => row.textContent)).toEqual([
      "偏向男生1 人25%", "偏向女生1 人25%", "都可以1 人25%", "未填写／其他1 人25%",
    ])
    expect(document.querySelector('[role="img"]')?.getAttribute("aria-label")).toContain("共4人")
    expect(document.querySelector('[role="img"]')?.getAttribute("style")).toContain("conic-gradient")
    expect(document.body.textContent).toContain("本人性别明确选择男或女")
    expect(document.querySelector("table")?.textContent).toContain("11-04")
  })
  it("excludes cancelled respondents from all counts and the chart denominator", () => {
    render([submission("female", "女"), { ...submission("male", "男"), cancelled_at: "2026-11-03T00:00:00Z" }])
    expect(document.querySelector('[aria-label="总报名：1人"]')).not.toBeNull()
    expect(document.querySelector('[aria-label="男生：0人"]')).not.toBeNull()
    expect(document.querySelector('[aria-label="搭档性别倾向明细"]')?.textContent).toContain("偏向女生1 人100%")
  })
  it("has an honest empty chart without NaN or fabricated preferences", () => {
    render([])
    expect(document.querySelector('[role="img"]')?.getAttribute("aria-label")).toContain("暂无报名")
    expect(document.querySelector('[role="img"]')?.getAttribute("style")).not.toContain("conic-gradient")
    expect(document.body.textContent).toContain("暂无报名，提交后会显示统计")
    expect(document.body.innerHTML).not.toMatch(/NaN|Infinity/)
    expect(document.querySelector("table")).toBeNull()
  })
  it("retains unspecified preferences in the pie without adding them to male/female personal counts", () => {
    render([submission(null, "女"), submission("other", "都可以"), submission(null, null)])
    expect(document.querySelector('[aria-label="男生：0人"]')).not.toBeNull()
    expect(document.querySelector('[aria-label="女生：0人"]')).not.toBeNull()
    expect(document.querySelector('[aria-label="搭档性别倾向明细"]')?.textContent).toContain("未填写／其他1 人33.3%")
    expect(document.querySelector('[role="img"]')?.getAttribute("aria-label")).toContain("共3人")
  })
})
