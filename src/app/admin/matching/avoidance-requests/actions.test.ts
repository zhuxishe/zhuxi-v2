import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), createClient: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
import { resolvePeerNoMatchRequestAction } from "./actions"
import { noMatchRequestFixture, resolvedNoMatchRequestFixture } from "@/lib/peer-no-match/admin-fixtures.test-support"
const input = { requestId: noMatchRequestFixture.id, status: "resolved" as const, expectedVersion: 1, internalNote: " 已人工确认后续活动安排 ", reason: " 核对申请后记录处理结果 " }

describe("recording a manual no-match request resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ role: "admin" })
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc })
    mocks.rpc.mockResolvedValue({ data: resolvedNoMatchRequestFixture, error: null })
  })
  it("calls only the audited request RPC, never blacklist or notification writes", async () => {
    expect(await resolvePeerNoMatchRequestAction(input)).toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_resolve_peer_no_match_request", {
      p_request_id: input.requestId, p_status: "resolved", p_internal_note: input.internalNote.trim(), p_expected_version: 1, p_reason: input.reason.trim(),
    })
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/matching/avoidance-requests")
    expect(mocks.revalidate).toHaveBeenCalledWith(`/app/matches/rounds/${noMatchRequestFixture.round_id}/reviews`)
  })
  it("requires admin identity and validates the terminal status, note, audit reason and version", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("ADMIN_REQUIRED"))
    await expect(resolvePeerNoMatchRequestAction(input)).rejects.toThrow("ADMIN_REQUIRED")
    for (const changes of [{ status: "pending" }, { expectedVersion: 0 }, { internalNote: "短" }, { reason: "" }, { requestId: "bad" }]) {
      expect(await resolvePeerNoMatchRequestAction({ ...input, ...changes } as typeof input)).toHaveProperty("error")
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("retains concurrent handling conflicts without a false success or refresh", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "PEER_NO_MATCH_NOT_PENDING" } })
    expect(await resolvePeerNoMatchRequestAction(input)).toEqual({ error: "申请已由其他工作人员更新，请刷新核对处理记录。当前输入已保留。" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it("validates the receipt before reporting a successful resolution", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: noMatchRequestFixture, error: null })
    expect(await resolvePeerNoMatchRequestAction(input)).toHaveProperty("error")
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})
