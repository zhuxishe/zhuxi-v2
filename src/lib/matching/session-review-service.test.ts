import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }))
import { fetchSavedMatchingReview, MatchingReviewStaleError, readSavedMatchingReview } from "./session-review-service"

const sessionId = "10000000-0000-4000-8000-000000000001"
const actor = "10000000-0000-4000-8000-000000000002"
const members = ["10000000-0000-4000-8000-000000000003", "10000000-0000-4000-8000-000000000004"]
function capture() {
  return { base_revision: "current-revision", session_status: "draft", cohort_member_ids: members, layout: null,
    results: [{ id: "result", status: "draft", member_a_id: members[0], member_b_id: members[1], group_members: null, best_slot: "2026-11-04_下午", rank: 1, total_score: 80, score_breakdown: { secret: "PRIVATE-SCORE" } }],
    capture: { captured_at: "2026-11-02T10:00:00Z", source: { submissions: members.map((id, i) => ({ member_id: id,
      availability: { "2026-11-04": ["下午", "晚上"] }, member: { member_number: `ZXS_${i}`, member_identity: { full_name: `Name ${i}`, secret: "PRIVATE-IDENTITY" } }, message: "PRIVATE-NOTE" })), blacklist: "PRIVATE-RELATION" } } }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.admin.mockResolvedValue({ id: actor, role: "super_admin" })
  mocks.rpc.mockResolvedValue({ data: capture(), error: null })
})

describe("read-only saved result review service", () => {
  it("uses a single authenticated administrator board capture for UI and export data", async () => {
    const result = await readSavedMatchingReview(sessionId, "current-revision")
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_get_matching_board", { p_session_id: sessionId, p_actor_admin_id: actor })
    expect(result.review.groups[0].members.map((person) => person.name)).toEqual(["Name 0", "Name 1"])
    expect(result.workbookData.submissions).toHaveLength(2)
    expect(result.workbookData.capturedAt).toBe(result.review.capturedAt)
  })
  it("exposes only the safe review to ordinary administrators", async () => {
    mocks.admin.mockResolvedValue({ id: actor, role: "admin" })
    const result = await fetchSavedMatchingReview(sessionId)
    expect(result.groups[0]).toMatchObject({ recommendedSlot: "2026-11-04_下午", timeStatus: "hidden", commonSlots: [] })
    expect(JSON.stringify(result)).not.toContain("晚上")
    expect(JSON.stringify(result)).not.toContain("PRIVATE")
    expect(result).not.toHaveProperty("workbookData")
  })
  it("does not let ordinary administrators obtain server-only workbook data", async () => {
    mocks.admin.mockResolvedValue({ id: actor, role: "admin" })
    await expect(readSavedMatchingReview(sessionId)).rejects.toThrow("仅超级管理员")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("rejects stale full-board revisions before producing any workbook", async () => {
    await expect(readSavedMatchingReview(sessionId, "old-revision")).rejects.toBeInstanceOf(MatchingReviewStaleError)
    expect(mocks.rpc).toHaveBeenCalledOnce()
  })
  it.each(["", "x".repeat(1001)])("rejects malformed expected revisions before querying", async (version) => {
    await expect(readSavedMatchingReview(sessionId, version)).rejects.toBeInstanceOf(MatchingReviewStaleError)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("never falls back to an old snapshot when the current capture is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "PRIVATE DATABASE DETAILS" } })
    await expect(readSavedMatchingReview(sessionId)).rejects.toThrow("暂时无法读取已保存")
  })
  it("never presents a fabricated empty table after incomplete source data", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...capture(), capture: { source: {} } }, error: null })
    await expect(fetchSavedMatchingReview(sessionId)).rejects.toThrow("无法完整读取")
  })
})
