import { describe, expect, it } from "vitest"
import { mapReviewContext, mapReviewRound, mapReviewSettings, mapActivityNoMatchRequest } from "./mappers"
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
  it("distinguishes the immutable existing policies from v2 without guessing from activity dates", () => {
    expect(mapReviewSettings({ review_system: "unified" }).policyVersion).toBe("unified_v1")
    expect(mapReviewSettings({ review_system: "legacy" }).policyVersion).toBe("legacy")
    expect(mapReviewContext({ review_system: "unified", review_policy: "unified_v2", settings: { review_system: "unified", review_policy: "unified_v2" }, no_match_requests: [], can_request_no_match: true }))
      .toMatchObject({ policyVersion: "unified_v2", canRequestNoMatch: true, ownNoMatchRequests: [] })
    expect(() => mapReviewSettings({ review_policy: "future" })).toThrow("Invalid activity review policy")
  })
  it("copies only the owner's safe no-match request fields and masked target identity", () => {
    const request = mapActivityNoMatchRequest({ id: "request", target_member_id: "target", target_name: null, target_nickname: null, reason: "本人说明", status: "resolved", version: 2, created_at: "today", updated_at: "today", internal_note: "PRIVATE", processed_by: "PRIVATE", processing_reason: "PRIVATE" })
    expect(request).toMatchObject({ targetName: null, targetNickname: null, reason: "本人说明", status: "resolved" })
    expect(JSON.stringify(request)).not.toContain("PRIVATE")
  })
})
