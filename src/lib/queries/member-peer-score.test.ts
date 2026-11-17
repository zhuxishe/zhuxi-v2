import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), createClient: vi.fn(), requireAdmin: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
import { fetchMemberPeerScore, normalizeMemberPeerScore } from "./member-peer-score"

const empty = { member_id: "member-id", score: null, reviewer_count: 0, activity_count: 0, review_count: 0, eligible_for_publication: false, sources: [] }
const rated = {
  ...empty, score: 3.8, reviewer_count: 2, activity_count: 3, review_count: 3, eligible_for_publication: true,
  sources: [
    { reviewer_id: "reviewer-a", reviewer_name: "甲", score: 4.5, review_count: 2, activity_count: 2, reviews: [
      { review_id: "review-1", round_id: "round-1", round_name: "迎新活动", score: 5, updated_at: "2026-10-01T09:00:00Z" },
      { review_id: "review-2", round_id: "round-2", round_name: "周末活动", score: 4, updated_at: "2026-10-08T09:00:00Z" },
    ] },
    { reviewer_id: "reviewer-b", reviewer_name: "乙", score: 3, review_count: 1, activity_count: 1, reviews: [
      { review_id: "review-3", round_id: "round-3", round_name: "交流活动", score: 3, updated_at: "2026-10-15T09:00:00Z" },
    ] },
  ],
}

describe("administrator-only member peer score", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ role: "admin" })
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc })
    mocks.rpc.mockResolvedValue({ data: empty, error: null })
  })

  it("checks administrator identity before reading and retains a real empty result", async () => {
    expect(await fetchMemberPeerScore("member-id")).toEqual({ status: "ready", data: empty })
    expect(mocks.rpc).toHaveBeenCalledWith("admin_get_member_peer_score", { p_member_id: "member-id" })
    expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[0])
    mocks.requireAdmin.mockRejectedValueOnce(new Error("ADMIN_REQUIRED"))
    mocks.rpc.mockClear()
    await expect(fetchMemberPeerScore("member-id")).rejects.toThrow("ADMIN_REQUIRED")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("preserves database aggregation instead of weighting people by their review counts", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: rated, error: null })
    const result = await fetchMemberPeerScore("member-id")
    expect(result).toEqual({ status: "ready", data: rated })
    expect(result.status === "ready" && result.data.score).toBe(3.8)
  })

  it("only treats the missing score RPC as not configured", async () => {
    for (const code of ["PGRST202", "42883"]) {
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { code, message: "function public.admin_get_member_peer_score does not exist" } })
      expect(await fetchMemberPeerScore("member-id")).toEqual({ status: "unavailable" })
    }
    for (const error of [
      { code: "42501", message: "permission denied" },
      { code: "42883", message: "private.score_dependency does not exist" },
      { code: "PGRST000", message: "connection failure" },
    ]) {
      mocks.rpc.mockResolvedValueOnce({ data: null, error })
      await expect(fetchMemberPeerScore("member-id")).rejects.toThrow(error.message)
    }
  })

  it("does not turn malformed or wrong-member data into zero reviews or a default score", () => {
    for (const value of [null, {}, { ...empty, member_id: "other-member" }, { ...empty, score: 5 },
      { ...empty, review_count: "0" }, { ...rated, score: Infinity }, { ...rated, score: 6 },
      { ...rated, sources: [] }, { ...rated, eligible_for_publication: "true" },
      { ...rated, sources: [{ ...rated.sources[0], reviews: [] }, rated.sources[1]] },
    ]) expect(() => normalizeMemberPeerScore(value, "member-id")).toThrow("数据格式无效")
  })
})
