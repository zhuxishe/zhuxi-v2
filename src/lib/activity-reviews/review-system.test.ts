import { describe, expect, it } from "vitest"
import { mapReviewContext, mapReviewRound, mapReviewSettings } from "./mappers"
import { activityReviewErrorMessage } from "./copy"

describe("activity review system version", () => {
  it("keeps pre-migration activity responses on the complete legacy behavior", () => {
    expect(mapReviewSettings({}).reviewSystem).toBe("legacy")
    expect(mapReviewRound({}).reviewSystem).toBe("legacy")
    expect(mapReviewContext({ settings: {} }).reviewSystem).toBe("legacy")
  })

  it("preserves the server-selected system from settings and event/context responses", () => {
    expect(mapReviewSettings({ review_system: "unified" }).reviewSystem).toBe("unified")
    expect(mapReviewRound({ review_system: "unified" }).reviewSystem).toBe("unified")
    const context = mapReviewContext({ review_system: "unified", settings: { review_system: "unified" } })
    expect(context.reviewSystem).toBe("unified")
    expect(context.settings.reviewSystem).toBe("unified")
    expect(mapReviewContext({ settings: { review_system: "unified" } }).reviewSystem).toBe("unified")
  })

  it("rejects an unknown version instead of quietly enabling legacy behavior", () => {
    expect(() => mapReviewSettings({ review_system: "future" })).toThrow("Invalid activity review system")
    expect(() => mapReviewContext({ review_system: "future" })).toThrow("Invalid activity review system")
  })

  it("explains the server's mandatory one-point report rule in each supported language", () => {
    expect(activityReviewErrorMessage("PEER_ONE_STAR_REPORT_REQUIRED", "zh")).toContain("1分评价需要提交")
    expect(activityReviewErrorMessage("PEER_ONE_STAR_REPORT_REQUIRED", "ja")).toContain("1 点の評価には")
  })
})
