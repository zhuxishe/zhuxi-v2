import { describe, expect, it } from "vitest"
import { validateReviewSubmission, validateReviewSettings, validateReviewRoster } from "./validation"
import { mapActivityReport, mapReviewContext, mapReviewRound, reviewWindowStatus } from "./mappers"
import type { SubmitActivityReviewInput } from "./types"

const roundId = "10000000-0000-4000-8000-000000000001"
const targetMemberId = "20000000-0000-4000-8000-000000000001"
const input: SubmitActivityReviewInput = { operation: "save", roundId, targetMemberId, review: { score: 4.5, comment: "聊得很愉快", expectedVersion: 0 } }
describe("activity peer feedback request boundaries", () => {
  it("accepts precisely the nine half-point scores", () => {
    for (const score of [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]) expect(validateReviewSubmission({ ...input, review: { ...input.review!, score } })).toBeNull()
    for (const score of [0, 0.5, 4.3, 5.5, NaN, Infinity]) expect(validateReviewSubmission({ ...input, review: { ...input.review!, score } })).toBe("PEER_SCORE_INVALID")
  })
  it("allows reporting without a fabricated score and validates supplementary reports", () => {
    const report = { category: "other" as const, detail: "这是一段需要工作人员核实的具体情况说明。", expectedVersion: 0 }
    expect(validateReviewSubmission({ operation: "save", roundId, targetMemberId, report })).toBeNull()
    expect(validateReviewSubmission({ operation: "append_report", roundId, targetMemberId, report })).toBe("PEER_INVALID_INPUT")
    expect(validateReviewSubmission({ operation: "append_report", roundId, targetMemberId, report: { ...report, expectedVersion: 1 } })).toBeNull()
    expect(validateReviewSubmission({ ...input, operation: "append_report", report: { ...report, expectedVersion: 1 } })).toBe("PEER_INVALID_INPUT")
  })
  it("counts Unicode characters and rejects invalid identity/version inputs", () => {
    expect(validateReviewSubmission({ ...input, review: { ...input.review!, comment: "😀".repeat(500) } })).toBeNull()
    expect(validateReviewSubmission({ ...input, review: { ...input.review!, comment: "字".repeat(501) } })).toBe("PEER_COMMENT_INVALID")
    expect(validateReviewSubmission({ ...input, targetMemberId: "someone" })).toBe("PEER_INVALID_INPUT")
    expect(validateReviewSubmission({ ...input, review: { ...input.review!, expectedVersion: -1 } })).toBe("PEER_VERSION_CONFLICT")
  })
  it("requires an existing report and forbids combining report editing with a rating", () => {
    const report = { category: "other" as const, detail: "更正此前提交的具体举报说明内容。", expectedVersion: 1 }
    expect(validateReviewSubmission({ operation: "edit_report", roundId, targetMemberId, report })).toBeNull()
    expect(validateReviewSubmission({ operation: "edit_report", roundId, targetMemberId, report: { ...report, expectedVersion: 0 } })).toBe("PEER_INVALID_INPUT")
    expect(validateReviewSubmission({ ...input, operation: "edit_report", report })).toBe("PEER_INVALID_INPUT")
    expect(validateReviewSubmission({ operation: "edit_report", roundId, targetMemberId })).toBe("PEER_INVALID_INPUT")
  })
  it("requires admin reasons, unique roster IDs and increasing dates", () => {
    const settings = { roundId, enabled: true, opensAt: "2026-10-10T08:00:00Z", closesAt: "2026-10-17T08:00:00Z", expectedVersion: 1, reason: "确认本场评价开放" }
    expect(validateReviewSettings(settings)).toBeNull()
    expect(validateReviewSettings({ ...settings, closesAt: settings.opensAt })).toBe("PEER_SETTINGS_INVALID")
    expect(validateReviewSettings({ ...settings, reason: "  " })).toBe("PEER_REASON_REQUIRED")
    expect(validateReviewRoster({ roundId, memberIds: [targetMemberId, targetMemberId], expectedVersion: 1, reason: settings.reason })).toBe("PEER_INVALID_INPUT")
  })
})
describe("activity peer feedback response privacy", () => {
  it("strips administrator-only data from the player report DTO", () => {
    const report = { id: "report", reviewee_id: targetMemberId, reporter_id: "secret", details: "original", internal_note: "staff only", status: "reviewing", supplements: [{ detail: "supplement", created_at: "today" }] }
    const player = mapActivityReport(report)
    expect(player).not.toHaveProperty("reporterId")
    expect(player).not.toHaveProperty("internalNote")
    expect(player.detail).toBe("original")
    expect(player.supplements[0].detail).toBe("supplement")
    expect(mapActivityReport(report, true).internalNote).toBe("staff only")
  })
  it("joins evaluation state by stable member ID instead of duplicate names", () => {
    const context = mapReviewContext({ round_id: roundId, participants: [{ member_id: "a", full_name: "同名" }, { member_id: "b", full_name: "同名" }], reviews: [{ reviewee_id: "b", score: 4.5 }], reports: [] })
    expect(context.participants[0].review).toBeNull()
    expect(context.participants[1].review?.score).toBe(4.5)
  })
  it("maps all permitted history targets even when the current search page is empty", () => {
    const context = mapReviewContext({ round_id: roundId, participants: [], reviews: [{ reviewee_id: "a", score: 4 }], history_targets: [
      { member_id: "a", full_name: "玩家甲", nickname: "竹子", can_review: true, can_report: true },
      { member_id: "b", full_name: null, nickname: null, can_review: false, can_report: false, internal_note: "not for player" },
    ] })
    expect(context.participants).toEqual([])
    expect(context.historyTargets).toEqual([
      { memberId: "a", fullName: "玩家甲", nickname: "竹子", canReview: true, canReport: true },
      { memberId: "b", fullName: "", nickname: null, canReview: false, canReport: false },
    ])
  })
  it("recognizes previous ratings and report-only feedback without increasing reviewed count", () => {
    expect(mapReviewRound({ reviewed_count: 1 }).hasSubmittedFeedback).toBe(true)
    expect(mapReviewRound({ reviewed_count: 0, has_submitted_feedback: true })).toMatchObject({ reviewedCount: 0, hasSubmittedFeedback: true })
    expect(mapReviewRound({ reviewed_count: 0 }).hasSubmittedFeedback).toBe(false)
    expect(mapReviewContext({ reports: [{ reviewee_id: targetMemberId }] })).toMatchObject({ reviewedCount: 0, hasSubmittedFeedback: true })
  })
  it("keeps window start inclusive and deadline exclusive independently of registration", () => {
    const settings = { enabled: true, rosterConfirmed: true, opensAt: "2026-10-10T08:00:00Z", closesAt: "2026-10-17T08:00:00Z", openedAt: null, version: 1 }
    expect(reviewWindowStatus(settings, Date.parse(settings.opensAt) - 1)).toBe("scheduled")
    expect(reviewWindowStatus(settings, Date.parse(settings.opensAt))).toBe("open")
    expect(reviewWindowStatus(settings, Date.parse(settings.closesAt))).toBe("closed")
  })
})
