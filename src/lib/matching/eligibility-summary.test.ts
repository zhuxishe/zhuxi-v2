import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn(), create: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.create }))
import { fetchMatchingEligibilitySummary } from "./eligibility-summary"

const roundId = "00000000-0000-4000-8000-000000000001"
const summary = {
  round_id: roundId, checked_at: "2026-10-24T01:00:00Z", submitted_count: 5,
  eligible_count: 2, excluded_count: 3,
  exclusion_summary: [{ reason: "unbound", count: 2 }, { reason: "profile_incomplete", count: 3 }],
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.admin.mockResolvedValue({ id: "admin" })
  mocks.create.mockReturnValue({ rpc: mocks.rpc })
  mocks.rpc.mockResolvedValue({ data: summary, error: null })
})

describe("current matching eligibility summary", () => {
  it("checks the administrator before calling the service-only aggregate RPC", async () => {
    expect(await fetchMatchingEligibilitySummary(roundId)).toEqual(summary)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_get_matching_eligibility_summary", {
      p_round_id: roundId, p_actor_admin_id: "admin",
    })
    mocks.rpc.mockClear()
    mocks.admin.mockRejectedValueOnce(new Error("login required"))
    await expect(fetchMatchingEligibilitySummary(roundId)).rejects.toThrow("login required")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("projects only aggregate fields and sanitizes unknown reason codes", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...summary,
      submissions: [{ member_id: "private-member", answer: "private-answer" }],
      exclusion_summary: [{ reason: "private-unknown-code", count: 1, member_id: "private-member" }],
    }, error: null })
    const result = await fetchMatchingEligibilitySummary(roundId)
    expect(result.exclusion_summary).toEqual([{ reason: "other", count: 1 }])
    expect(JSON.stringify(result)).not.toContain("private")
  })

  it("keeps a confirmed zero separate from an unreadable or malformed result", async () => {
    const zero = { ...summary, submitted_count: 0, eligible_count: 0, excluded_count: 0, exclusion_summary: [] }
    mocks.rpc.mockResolvedValueOnce({ data: zero, error: null })
    expect(await fetchMatchingEligibilitySummary(roundId)).toEqual(zero)
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "database secret" } })
    await expect(fetchMatchingEligibilitySummary(roundId)).rejects.toThrow("暂时无法读取")
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(fetchMatchingEligibilitySummary(roundId)).rejects.toThrow("格式异常")
  })

  it.each([
    { submitted_count: 4 }, { eligible_count: -1 }, { excluded_count: 1.5 },
    { round_id: "another-round" }, { checked_at: "invalid" }, { exclusion_summary: null },
    { exclusion_summary: [{ reason: "unbound", count: 4 }] },
  ])("rejects inconsistent metadata rather than inferring eligibility: %j", async (change) => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...summary, ...change }, error: null })
    await expect(fetchMatchingEligibilitySummary(roundId)).rejects.toThrow("格式异常")
  })

  it("rejects invalid identifiers before creating a privileged client", async () => {
    await expect(fetchMatchingEligibilitySummary("invalid")).rejects.toThrow("Invalid UUID")
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
