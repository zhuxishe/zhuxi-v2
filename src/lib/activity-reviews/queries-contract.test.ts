import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), createClient: vi.fn(), createAdminClient: vi.fn(), admin: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
import { activityReviewRpc, fetchActivityReviewContext, fetchAdminActivityReviews, fetchMyActivityReviewRounds } from "./queries"

const roundId = "30000000-0000-0000-0000-000000000001"
beforeEach(() => {
  vi.clearAllMocks()
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc })
  mocks.rpc.mockResolvedValue({ data: {}, error: null })
  mocks.admin.mockResolvedValue({ role: "admin" })
})

describe("peer review query transport", () => {
  it("uses the session client, preserving auth.uid instead of service role", async () => {
    await activityReviewRpc("player_get_round_peer_reviews", { p_round_id: roundId })
    expect(mocks.createClient).toHaveBeenCalledOnce()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("player_get_round_peer_reviews", { p_round_id: roundId })
  })
  it("handles an unapplied migration without exposing internal database errors", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "missing private catalog function" } })
    await expect(activityReviewRpc("player_list_round_peer_review_events")).rejects.toThrow("PEER_UNAVAILABLE")
  })
  it("returns empty activity links if the feature is not deployed", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "42883", message: "function does not exist" } })
    expect(await fetchMyActivityReviewRounds()).toEqual([])
  })
  it("forwards search and pagination to SQL, with no local-page filtering", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { round_id: roundId, eligible: true, total: 52, page: 2, page_size: 24, participants: [], settings: {} }, error: null })
    const result = await fetchActivityReviewContext(roundId, "  昵称  ", 2)
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("player_get_round_peer_reviews", { p_round_id: roundId, p_search: "昵称", p_page: 2, p_page_size: 24 })
    expect(result.total).toBe(52)
    expect(result.page).toBe(2)
  })
  it("does not issue RPCs for malformed round identifiers", async () => {
    expect((await fetchActivityReviewContext("invalid")).eligible).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("does not replace real database failures with an empty successful page", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "database unavailable" } })
    await expect(fetchMyActivityReviewRounds()).rejects.toThrow("PEER_SAVE_FAILED")
  })
  it("requires administrator authorization before lookup or RPC access", async () => {
    mocks.admin.mockRejectedValueOnce(new Error("admin denied"))
    await expect(fetchAdminActivityReviews({ roundId })).rejects.toThrow("admin denied")
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })
  it("short-circuits the admin page when its migration is absent", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "function absent" } })
    const result = await fetchAdminActivityReviews({ roundId })
    expect(result.setupRequired).toBe(true)
    expect(result.context).toBeNull()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })
})
