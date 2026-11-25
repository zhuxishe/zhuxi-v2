import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ requireSuperAdmin: vi.fn(), rpc: vi.fn(), createClient: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireSuperAdmin: mocks.requireSuperAdmin }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
import { fetchMemberPeerScoreDirectory, normalizeMemberPeerScoreDirectory } from "./member-peer-score-directory"
import { normalizePeerScoreDirectoryControls, peerScoreDirectoryHref } from "@/lib/member-master/peer-score-directory-controls"

const memberId = "10000000-0000-4000-8000-000000000001"
const emptyMember = { member_id: memberId, full_name: "竹友", nickname: "小竹", member_number: null,
  score: null, reviewer_count: 0, activity_count: 0, review_count: 0, latest_review_at: null, sample_status: "unrated" }
const response = { members: [emptyMember], total: 1, page: 1, page_size: 30, sort: "latest_review_at", direction: "desc", sample_status: "all", can_view_member_number: false }

describe("member peer score directory query", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireSuperAdmin.mockResolvedValue({ role: "super_admin" })
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc })
    mocks.rpc.mockResolvedValue({ data: response, error: null })
  })
  it("uses the session admin RPC and includes genuinely unrated members without fabricating a score", async () => {
    const result = await fetchMemberPeerScoreDirectory()
    expect(mocks.rpc).toHaveBeenCalledWith("admin_list_member_peer_scores", {
      p_search: "", p_page: 1, p_page_size: 30, p_sort: "latest_review_at", p_direction: "desc", p_sample_status: "all",
    })
    expect(mocks.requireSuperAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[0])
    expect(result).toMatchObject({ status: "ready", data: { total: 1, members: [{ memberId, score: null, reviewCount: 0, sampleStatus: "unrated" }] } })
    mocks.requireSuperAdmin.mockRejectedValueOnce(new Error("ADMIN_REQUIRED"))
    mocks.rpc.mockClear()
    await expect(fetchMemberPeerScoreDirectory()).rejects.toThrow("ADMIN_REQUIRED")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("passes the search, status and sorting controls explicitly", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...response, members: [], total: 0, sort: "reviewer_count", direction: "asc", sample_status: "ready" }, error: null })
    await fetchMemberPeerScoreDirectory({ search: "  林秋  ", status: "ready", sort: "reviewer_count", direction: "asc" })
    expect(mocks.rpc).toHaveBeenCalledWith("admin_list_member_peer_scores", {
      p_search: "林秋", p_page: 1, p_page_size: 30, p_sort: "reviewer_count", p_direction: "asc", p_sample_status: "ready",
    })
  })
  it("allows member numbers when permitted by the database response", async () => {
    const numbered = { ...response, can_view_member_number: true, members: [{ ...emptyMember, member_number: "102" }] }
    mocks.rpc.mockResolvedValueOnce({ data: numbered, error: null })
    expect(await fetchMemberPeerScoreDirectory()).toMatchObject({ status: "ready", data: { canViewMemberNumber: true, members: [{ memberNumber: "102" }] } })
    expect(() => normalizeMemberPeerScoreDirectory(numbered, false)).toThrow("数据格式无效")
    expect(() => normalizeMemberPeerScoreDirectory({ ...response, members: [{ ...emptyMember, member_number: "102" }] }, true)).toThrow("数据格式无效")
  })
  it("corrects a stale out-of-range page with one bounded read", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...response, members: [], page: 999 }, error: null })
    const result = await fetchMemberPeerScoreDirectory({ page: "999" })
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    expect(mocks.rpc.mock.calls.map((call) => call[1].p_page)).toEqual([999, 1])
    expect(result).toMatchObject({ status: "ready", data: { page: 1, total: 1 } })
  })
  it("distinguishes a missing deployment from permissions, dependencies and malformed responses", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find public.admin_list_member_peer_scores" } })
    expect(await fetchMemberPeerScoreDirectory()).toEqual({ status: "unavailable" })
    for (const error of [{ code: "42501", message: "permission denied" }, { code: "42883", message: "private.dependency does not exist" }]) {
      mocks.rpc.mockResolvedValueOnce({ data: null, error })
      await expect(fetchMemberPeerScoreDirectory()).rejects.toThrow(error.message)
    }
    for (const invalid of [null, {}, { ...response, members: [{ ...emptyMember, score: 5 }] },
      { ...response, members: [{ ...emptyMember, latest_review_at: "invalid" }] }, { ...response, total: "1" },
      { ...response, members: [emptyMember, emptyMember], total: 2 },
    ]) expect(() => normalizeMemberPeerScoreDirectory(invalid, false)).toThrow("数据格式无效")
  })
})

describe("peer score directory URL controls", () => {
  it("normalizes malformed controls and limits search by Unicode code point", () => {
    expect(normalizePeerScoreDirectoryControls({ page: "1e3", status: "bad", sort: "bad", direction: "bad" })).toEqual({ search: "", page: 1, status: "all", sort: "latest_review_at", direction: "desc" })
    expect(normalizePeerScoreDirectoryControls({ search: "🧩".repeat(105), page: "1000001" })).toMatchObject({ search: "🧩".repeat(100), page: 1_000_000 })
  })
  it("preserves every selected filter across pagination", () => {
    const controls = normalizePeerScoreDirectoryControls({ search: "林 秋", status: "accumulating", sort: "score", direction: "asc" })
    expect(peerScoreDirectoryHref(controls, 2)).toBe("/admin/peer-scores?search=%E6%9E%97+%E7%A7%8B&status=accumulating&sort=score&direction=asc&page=2")
    expect(peerScoreDirectoryHref(normalizePeerScoreDirectoryControls(), 1)).toBe("/admin/peer-scores")
  })
})
