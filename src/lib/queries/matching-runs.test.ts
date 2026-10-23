import { beforeEach, describe, expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn(), create: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mock.admin }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.create }))
import { fetchRoundMatchingRuns } from "./matching-runs"
const roundId = "00000000-0000-4000-8000-000000000001"

beforeEach(() => {
  vi.resetAllMocks()
  mock.admin.mockResolvedValue({ id: "admin" })
  mock.create.mockResolvedValue({ rpc: mock.rpc })
})

describe("safe round run metadata query", () => {
  it("requires the authenticated admin and calls the round-scoped metadata RPC", async () => {
    const rows = [{ id: "run", status: "running" }]
    mock.rpc.mockResolvedValue({ data: rows, error: null })
    expect(await fetchRoundMatchingRuns(roundId)).toEqual(rows)
    expect(mock.admin).toHaveBeenCalledOnce()
    expect(mock.rpc).toHaveBeenCalledWith("admin_list_round_matching_runs", { p_round_id: roundId })
  })

  it("does not turn query errors into an empty successful history", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "internal secret" } })
    await expect(fetchRoundMatchingRuns(roundId)).rejects.toThrow("暂时无法读取本轮运行记录")
    mock.rpc.mockResolvedValue({ data: {}, error: null })
    await expect(fetchRoundMatchingRuns(roundId)).rejects.toThrow("本轮运行记录格式异常")
  })

  it("rejects malformed round identifiers before querying", async () => {
    await expect(fetchRoundMatchingRuns("invalid")).rejects.toThrow("Invalid UUID")
    expect(mock.rpc).not.toHaveBeenCalled()
  })
})
