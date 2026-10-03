import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { ActivityReviewRound } from "@/lib/activity-reviews/types"
import { ActivityReviewEntry } from "./ActivityReviewEntry"

const round: ActivityReviewRound = { roundId: "autumn", title: "秋季迎新派对", status: "open", opensAt: null, closesAt: null, reviewedCount: 0, participantCount: 10, canReview: true, canReport: true }

describe("activity review entry after submitting feedback", () => {
  it.each([false, true])("keeps the entry available in compact=%s after report-only feedback", (compact) => {
    const html = renderToStaticMarkup(createElement(ActivityReviewEntry, { round: { ...round, hasSubmittedFeedback: true }, compact, locale: "zh" }))
    expect(html).toContain("继续评价")
    expect(html).toContain('href="/app/matches/rounds/autumn/reviews"')
  })

  it("offers a read-only entry when the scoring window closes", () => {
    const html = renderToStaticMarkup(createElement(ActivityReviewEntry, { round: { ...round, hasSubmittedFeedback: true, canReview: false, status: "closed" }, locale: "zh" }))
    expect(html).toContain("查看本场评价")
    expect(html).not.toContain("继续评价")
  })
})
