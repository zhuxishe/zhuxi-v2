import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), createClient: vi.fn(), rpc: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
import { fetchAdminPeerNoMatchRequests, normalizeAdminPeerNoMatchRequest } from "./admin-peer-no-match-requests"
import { noMatchRequestFixture, resolvedNoMatchRequestFixture } from "@/lib/peer-no-match/admin-fixtures.test-support"

const page = { requests: [noMatchRequestFixture], total: 1, page: 1, page_size: 30 }
describe("admin no-match requests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ role: "admin" })
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc })
    mocks.rpc.mockResolvedValue({ data: page, error: null })
  })
  it("requires an administrator and reads the pending queue through a session RPC", async () => {
    expect(await fetchAdminPeerNoMatchRequests()).toMatchObject({ status: "ready", data: { total: 1, requests: [{ status: "pending", reason: noMatchRequestFixture.reason }] } })
    expect(mocks.rpc).toHaveBeenCalledWith("admin_list_peer_no_match_requests", { p_status: "pending", p_page: 1, p_page_size: 30 })
    expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[0])
    mocks.requireAdmin.mockRejectedValueOnce(new Error("ADMIN_REQUIRED"))
    mocks.rpc.mockClear()
    await expect(fetchAdminPeerNoMatchRequests()).rejects.toThrow("ADMIN_REQUIRED")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("preserves operator, time, note and reason in terminal records", () => {
    expect(normalizeAdminPeerNoMatchRequest(resolvedNoMatchRequestFixture)).toMatchObject({
      status: "resolved", processedByName: "工作人员丙", processedAt: "2026-11-23T07:00:00Z",
      internalNote: "已人工确认后续活动安排", processingReason: "核对申请后记录处理结果",
    })
  })
  it("keeps missing deployment distinct from a real empty queue and read errors", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "admin_list_peer_no_match_requests missing" } })
    expect(await fetchAdminPeerNoMatchRequests()).toEqual({ status: "unavailable" })
    mocks.rpc.mockResolvedValueOnce({ data: { ...page, total: 0, requests: [] }, error: null })
    expect(await fetchAdminPeerNoMatchRequests()).toMatchObject({ status: "ready", data: { total: 0, requests: [] } })
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "permission denied" } })
    await expect(fetchAdminPeerNoMatchRequests()).rejects.toThrow("读取失败")
  })
  it("rejects inconsistent state or missing audit fields instead of inventing a processed result", () => {
    for (const value of [null, {}, { ...noMatchRequestFixture, status: "approved" },
      { ...resolvedNoMatchRequestFixture, processed_at: null }, { ...resolvedNoMatchRequestFixture, internal_note: null },
      { ...resolvedNoMatchRequestFixture, processing_reason: null }, { ...noMatchRequestFixture, requester_id: noMatchRequestFixture.target_member_id },
    ]) expect(() => normalizeAdminPeerNoMatchRequest(value)).toThrow("数据格式无效")
  })
  it("corrects an out-of-range page with one bounded read and keeps the filter", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...page, page: 8, requests: [] }, error: null })
    expect(await fetchAdminPeerNoMatchRequests({ page: 8 })).toMatchObject({ status: "ready", data: { page: 1 } })
    expect(mocks.rpc.mock.calls.map((call) => call[1].p_page)).toEqual([8, 1])
  })
})
