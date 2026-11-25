import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), auth: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireSuperAdmin: mocks.auth }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }))
import { fetchMemberPeerScoreDetail, normalizeMemberPeerScoreDetail, parseMemberPeerScoreDetailFilters } from "./member-peer-score-detail"
import { detailMemberId, detailRoundIds, memberPeerScoreDetailFixture } from "./__fixtures__/member-peer-score-detail"

const filters = { validity: "valid" as const, roundId: null, page: 1, pageSize: 20 }
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ role: "super_admin" }); mocks.rpc.mockResolvedValue({ data: memberPeerScoreDetailFixture(), error: null }) })

describe("administrator peer-score detail data", () => {
  it("authenticates before invoking the caller-scoped detail RPC", async () => {
    expect((await fetchMemberPeerScoreDetail(detailMemberId, filters)).status).toBe("ready")
    expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[0])
    expect(mocks.rpc).toHaveBeenCalledWith("admin_get_member_peer_score_detail", { p_member_id: detailMemberId, p_validity: "valid", p_round_id: null, p_page: 1, p_page_size: 20 })
    mocks.auth.mockRejectedValueOnce(new Error("denied")); mocks.rpc.mockClear()
    await expect(fetchMemberPeerScoreDetail(detailMemberId, filters)).rejects.toThrow("denied")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("retains whole-history reviewer/activity summaries when filtering and paging records", async () => {
    const value = memberPeerScoreDetailFixture()
    value.reviews = value.reviews.slice(0, 1); value.total = 1; value.round_id = detailRoundIds[0]
    mocks.rpc.mockResolvedValue({ data: value, error: null })
    const result = await fetchMemberPeerScoreDetail(detailMemberId, { ...filters, roundId: detailRoundIds[0] })
    expect(result.status).toBe("ready")
    if (result.status !== "ready") throw new Error("missing detail")
    expect(result.data.summary.score).toBe(3.8)
    expect(result.data.reviewers[0].score).toBe(4.5)
    expect(result.data.reviewers[0].reviewCount).toBe(2)
    expect(result.data.activities).toHaveLength(4)
    expect(result.data.activities[3]).toMatchObject({ reviewCount: 0, averageScore: null, registrationStatus: "cancelled" })
    expect(mocks.rpc).toHaveBeenCalledWith("admin_get_member_peer_score_detail", expect.objectContaining({ p_round_id: detailRoundIds[0] }))
  })

  it("drops report payloads and unauthorized member numbers even if the RPC unexpectedly supplies them", () => {
    const value = memberPeerScoreDetailFixture()
    const result = normalizeMemberPeerScoreDetail({ ...value, can_view_member_number: false, report_details: "PRIVATE REPORT", reports: [{ details: "PRIVATE REPORT" }], reviews: value.reviews.map(row => ({ ...row, reporter_id: "private", report_details: "PRIVATE REPORT" })) }, detailMemberId)
    expect(result.member.memberNumber).toBeNull()
    expect(JSON.stringify(result)).not.toContain("PRIVATE REPORT")
    expect(result.operationalScore?.updatedByName).toBe("管理员乙")
    expect(result.reviews[0].comment).toBe("交流时很照顾新成员。")
  })

  it("retains invalidation reasons without treating invalid records as valid", () => {
    const value = memberPeerScoreDetailFixture()
    value.validity = "invalid"; value.reviews = [{ ...value.reviews[0], valid: false, latest_invalidation_reason: "管理员确认未实际交流", invalidated_at: "2026-11-17T10:00:00Z" }]; value.total = 1
    const result = normalizeMemberPeerScoreDetail(value, detailMemberId)
    expect(result.reviews[0]).toMatchObject({ valid: false, invalidationReason: "管理员确认未实际交流" })
    expect(result.summary.score).toBe(3.8)
  })

  it("distinguishes an empty score, missing member, absent feature and database failure", async () => {
    const value = memberPeerScoreDetailFixture()
    const empty = { ...value, summary: { ...value.summary, score: null, reviewer_count: 0, activity_count: 0, review_count: 0, eligible_for_publication: false, latest_review_at: null, sample_status: "unrated" }, reviewer_summaries: [], reviews: [], total: 0, operational_score: null }
    mocks.rpc.mockResolvedValueOnce({ data: empty, error: null })
    expect(await fetchMemberPeerScoreDetail(detailMemberId, filters)).toMatchObject({ status: "ready", data: { summary: { score: null, reviewCount: 0 }, operationalScore: null } })
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0002", message: "PEER_DIRECTORY_MEMBER_NOT_FOUND" } })
    expect(await fetchMemberPeerScoreDetail(detailMemberId, filters)).toEqual({ status: "not_found" })
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "public.admin_get_member_peer_score_detail is missing" } })
    expect(await fetchMemberPeerScoreDetail(detailMemberId, filters)).toEqual({ status: "unavailable" })
    for (const error of [{ code: "XX000", message: "offline" }, { code: "42883", message: "private.helper is missing" }, { code: "42501", message: "permission denied" }]) {
      mocks.rpc.mockResolvedValueOnce({ data: null, error })
      await expect(fetchMemberPeerScoreDetail(detailMemberId, filters)).rejects.toThrow("详情读取失败")
    }
  })

  it("rejects malformed or wrong-member results instead of displaying a fabricated empty score", () => {
    const value = memberPeerScoreDetailFixture()
    for (const invalid of [null, {}, { ...value, member: { ...value.member, member_id: detailRoundIds[0] } }, { ...value, reviewer_summaries: [] }, { ...value, summary: { ...value.summary, score: 6 } }, { ...value, reviews: [{ ...value.reviews[0], valid: false }] }, { ...value, round_id: detailRoundIds[2] }]) {
      expect(() => normalizeMemberPeerScoreDetail(invalid, detailMemberId)).toThrow("数据格式无效")
    }
  })

  it("normalizes URL filters and forwards only bounded parameters", async () => {
    expect(parseMemberPeerScoreDetailFilters({ validity: "all", roundId: detailRoundIds[0], page: "2" })).toEqual({ validity: "all", roundId: detailRoundIds[0], page: 2, pageSize: 20 })
    expect(parseMemberPeerScoreDetailFilters({ validity: ["invalid", "all"], roundId: "https://outside.test", page: "Infinity" })).toEqual(filters)
    expect(await fetchMemberPeerScoreDetail("not-a-member", filters)).toEqual({ status: "not_found" })
    expect(mocks.rpc).not.toHaveBeenCalled()
    await expect(fetchMemberPeerScoreDetail(detailMemberId, { ...filters, page: 0 })).rejects.toThrow("筛选条件无效")
  })
})
