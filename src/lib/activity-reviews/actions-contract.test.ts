import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ player: vi.fn(), admin: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/auth/player", () => ({ requirePlayer: mocks.player }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
vi.mock("@/lib/activity-reviews/queries", () => ({
  activityReviewRpc: mocks.rpc,
  activityReviewErrorCode: (error: unknown) => error instanceof Error ? error.message : "PEER_SAVE_FAILED",
}))
import { submitActivityReviewAction } from "@/app/app/matches/rounds/[roundId]/reviews/actions"
import { saveActivityReviewSettingsAction, confirmActivityReviewRosterAction, moderateActivityReviewAction, moderateActivityReportAction } from "@/app/admin/activity-reviews/actions"

const roundId = "30000000-0000-0000-0000-000000000001"
const memberId = "10000000-0000-0000-0000-000000000002"
const otherMemberId = "10000000-0000-0000-0000-000000000003"
const id = "50000000-0000-0000-0000-000000000001"
const requestId = "40000000-0000-0000-0000-000000000001"
const reason = "工作人员现场核实"
const at = "2026-10-03T12:00:00.000Z"
const reportRow = { id, reviewee_id: memberId, category: "other", details: "具体举报事实说明至少十个字", supplements: [], status: "pending", version: 1, updated_at: at, internal_note: "内部保密信息", reporter_id: otherMemberId }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.player.mockResolvedValue({ memberId: otherMemberId })
  mocks.admin.mockResolvedValue({ id: "admin", role: "admin" })
  mocks.rpc.mockResolvedValue({})
})

describe("peer feedback server action boundary", () => {
  it("authenticates the player before invoking any database RPC", async () => {
    mocks.player.mockRejectedValueOnce(new Error("redirect to login"))
    await expect(submitActivityReviewAction({ roundId, targetMemberId: memberId, operation: "save", review: { score: 4, comment: "", expectedVersion: 0 } })).rejects.toThrow("redirect to login")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("rejects malformed scores before database access", async () => {
    expect(await submitActivityReviewAction({ roundId, targetMemberId: memberId, operation: "save", review: { score: 4.3, comment: "", expectedVersion: 0 } })).toEqual({ error: "PEER_SCORE_INVALID" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("submits score and report as one atomic RPC with caller-independent identity", async () => {
    mocks.rpc.mockResolvedValueOnce({ review: { id, reviewee_id: memberId, score: 4.5, comment: "交流愉快", version: 2, valid: true, updated_at: at }, report: reportRow })
    const result = await submitActivityReviewAction({ roundId, targetMemberId: memberId, operation: "save", requestId,
      review: { score: 4.5, comment: " 交流愉快 ", expectedVersion: 1 },
      report: { category: "other", detail: " 具体举报事实说明至少十个字 ", expectedVersion: 0 },
    })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("player_submit_round_peer_feedback", {
      p_round_id: roundId, p_reviewee_id: memberId, p_score: 4.5, p_comment: "交流愉快", p_review_version: 1,
      p_report_category: "other", p_report_details: "具体举报事实说明至少十个字", p_report_version: 0, p_request_id: requestId,
    })
    expect(result.success).toBe(true)
    expect(result.review?.score).toBe(4.5)
    expect(result.report?.internalNote).toBeUndefined()
    expect(result.report?.reporterId).toBeUndefined()
    expect(mocks.revalidate).toHaveBeenCalledWith(`/app/matches/rounds/${roundId}/reviews`)
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/activity-reviews")
  })
  it("supports report-only and append-only submissions without a fabricated score", async () => {
    mocks.rpc.mockResolvedValueOnce({ review: null, report: reportRow })
    await submitActivityReviewAction({ roundId, targetMemberId: memberId, operation: "append_report", requestId,
      report: { category: "other", detail: reportRow.details, expectedVersion: 3 },
    })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("player_submit_round_peer_feedback", {
      p_round_id: roundId, p_reviewee_id: memberId, p_score: null, p_comment: "", p_review_version: 0,
      p_report_category: "other", p_report_details: reportRow.details, p_report_version: 3, p_request_id: requestId,
    })
  })
  it("preserves version conflicts and does not pretend failure was saved", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("PEER_VERSION_CONFLICT"))
    expect(await submitActivityReviewAction({ roundId, targetMemberId: memberId, operation: "save", review: { score: 4, comment: "", expectedVersion: 0 } })).toEqual({ error: "PEER_VERSION_CONFLICT" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it("updates an existing report through its dedicated RPC without touching the rating", async () => {
    mocks.rpc.mockResolvedValueOnce({ review: null, report: { ...reportRow, category: "privacy", version: 2 } })
    const result = await submitActivityReviewAction({ roundId, targetMemberId: memberId, operation: "edit_report", requestId,
      report: { category: "privacy", detail: ` ${reportRow.details} `, expectedVersion: 1 },
    })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("player_update_round_peer_report", {
      p_round_id: roundId, p_reviewee_id: memberId, p_category: "privacy", p_details: reportRow.details, p_expected_version: 1, p_request_id: requestId,
    })
    expect(result.review).toBeNull()
    expect(result.report).toMatchObject({ category: "privacy", version: 2 })
    expect(result.report).not.toHaveProperty("internalNote")
    expect(result.report).not.toHaveProperty("reporterId")
    expect(mocks.revalidate).toHaveBeenCalledWith("/app")
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/activity-reviews")
  })
  it("leaves a concurrently moderated report untouched and returns a useful error", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("PEER_REPORT_NOT_EDITABLE"))
    expect(await submitActivityReviewAction({ roundId, targetMemberId: memberId, operation: "edit_report",
      report: { category: "other", detail: reportRow.details, expectedVersion: 1 },
    })).toEqual({ error: "PEER_REPORT_NOT_EDITABLE" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})

describe("peer feedback administrator action contract", () => {
  it("authenticates the administrator before mutating", async () => {
    mocks.admin.mockRejectedValueOnce(new Error("admin denied"))
    await expect(confirmActivityReviewRosterAction({ roundId, memberIds: [memberId, otherMemberId], expectedVersion: 1, reason })).rejects.toThrow("admin denied")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("passes settings with explicit version, independent window and audit reason", async () => {
    const end = "2026-10-10T12:00:00.000Z"
    expect(await saveActivityReviewSettingsAction({ roundId, enabled: false, opensAt: at, closesAt: end, expectedVersion: 0, reason })).toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_save_round_peer_review_settings", {
      p_round_id: roundId, p_enabled: false, p_opens_at: at, p_closes_at: end, p_expected_version: 0, p_reason: reason,
    })
  })
  it.each([true, false])("passes the explicit automatic roster mode %s through the versioned settings save", async (autoIncludeRegistered) => {
    const end = "2026-10-10T12:00:00.000Z"
    expect(await saveActivityReviewSettingsAction({ roundId, enabled: true, autoIncludeRegistered, opensAt: at, closesAt: end, expectedVersion: 2, reason })).toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_save_round_peer_review_settings", {
      p_round_id: roundId, p_enabled: true, p_opens_at: at, p_closes_at: end, p_expected_version: 2, p_reason: reason, p_auto_include_registered: autoIncludeRegistered,
    })
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/activity-reviews")
    expect(mocks.revalidate).toHaveBeenCalledWith("/app")
    expect(mocks.revalidate).toHaveBeenCalledWith(`/app/matches/rounds/${roundId}/reviews`)
  })
  it("rejects a malformed automatic roster mode before touching database settings", async () => {
    expect(await saveActivityReviewSettingsAction({ roundId, enabled: true, autoIncludeRegistered: "false" as unknown as boolean, opensAt: at, closesAt: "2026-10-10T12:00:00.000Z", expectedVersion: 2, reason })).toEqual({ error: "PEER_SETTINGS_INVALID" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("confirms the exact roster with optimistic concurrency", async () => {
    await confirmActivityReviewRosterAction({ roundId, memberIds: [memberId, otherMemberId], expectedVersion: 2, reason })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_confirm_round_peer_review_roster", { p_round_id: roundId, p_member_ids: [memberId, otherMemberId], p_expected_version: 2, p_reason: reason })
    for (const path of ["/admin/matching", "/app/matching", "/app/matching/survey", "/app/community/notifications", "/app/matches"]) {
      expect(mocks.revalidate).toHaveBeenCalledWith(path)
    }
  })
  it("marks a review invalid without deleting it", async () => {
    await moderateActivityReviewAction({ roundId, reviewId: id, valid: false, expectedVersion: 3, reason })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_moderate_round_peer_review", { p_review_id: id, p_valid: false, p_expected_version: 3, p_reason: reason })
  })
  it("keeps report disposition and internal notes in the admin RPC", async () => {
    await moderateActivityReportAction({ roundId, reportId: id, status: "reviewing", internalNote: " 核查具体现场记录 ", expectedVersion: 2, reason })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_resolve_round_peer_report", { p_report_id: id, p_status: "reviewing", p_internal_note: "核查具体现场记录", p_expected_version: 2, p_reason: reason })
  })
})
