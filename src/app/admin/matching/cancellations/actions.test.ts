import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), createClient: vi.fn(), rpc: vi.fn(), revalidatePath: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
import { approveCancellation, rejectCancellation } from "./actions"
const reason = "核实本组取消申请后审批"
const requestedAt = "2026-10-23T03:00:00.123456+09:00"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAdmin.mockResolvedValue({ id: "admin" })
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc })
  mocks.rpc.mockResolvedValue({ data: { already_applied: false }, error: null })
})

describe("versioned cancellation review", () => {
  it.each([
    [approveCancellation, "admin_approve_matching_cancellation"],
    [rejectCancellation, "admin_reject_matching_cancellation"],
  ] as const)("keeps the review action %s scoped to one result and publication version", async (action, rpcName) => {
    await expect(action("result-id", reason, 2, requestedAt)).resolves.toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(rpcName, { p_result_id: "result-id", p_reason: reason, p_expected_publication_version: 2, p_expected_requested_at: requestedAt })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/matches", "layout")
  })

  it("asks for refresh when another administrator reviewed the request or a new version was published", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PT409", message: "MATCH_PUBLICATION_STALE" } })
    await expect(approveCancellation("result-id", reason, 1, requestedAt)).resolves.toEqual({ error: "发布版本或审批状态已变化，请刷新并核对后重试；当前操作未生效" })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("treats a same-result approval retry as success", async () => {
    mocks.rpc.mockResolvedValue({ data: { already_applied: true }, error: null })
    await expect(approveCancellation("result-id", reason, 2, requestedAt)).resolves.toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it("does not submit an action without the page's version", async () => {
    await expect(rejectCancellation("result-id", reason, Number.NaN, requestedAt)).resolves.toEqual({ error: "发布版本无效，请刷新后重试" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("requires the raw request timestamp so an old request cannot approve a newer pending request", async () => {
    await expect(approveCancellation("result-id", reason, 2, null)).resolves.toEqual({ error: "取消申请版本无效，请刷新后重试" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

})
