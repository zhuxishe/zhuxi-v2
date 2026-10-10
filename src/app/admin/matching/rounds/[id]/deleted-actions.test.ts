import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ from: vi.fn(), admin: vi.fn(), rpc: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from, rpc: mocks.rpc }) }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { createSubmission, deleteSubmission, runRoundMatching, updateSubmission } from "./actions"

const deletedRound = { id: "round", purpose: "matching", status: "closed", deleted_at: "2026-10-10T00:00:00Z" }
const answers = { game_type_pref: "都可以", gender_pref: "都可以", availability: { "2026-10-11": ["下午"] }, interest_tags: [], social_style: null, message: null }
function read(data: unknown) {
  const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn() }
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query)
  query.single.mockResolvedValue({ data, error: null })
  return query
}

describe("deleted round write guards", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.admin.mockResolvedValue({ id: "admin", role: "super_admin" })
    mocks.from.mockImplementation((table: string) => read(table === "match_rounds" ? deletedRound : { round_id: "round" }))
  })

  it("does not run matching for a deleted closed round", async () => {
    expect(await runRoundMatching("round", "test", "重新核对匹配")).toEqual({ error: "轮次不存在" })
    expect(mocks.from).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("does not add a submission to a deleted round", async () => {
    expect(await createSubmission("round", "member", answers, "补录原始问卷")).toEqual({ error: "轮次不存在" })
    expect(mocks.from).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("does not update retained submissions via an old admin page", async () => {
    expect(await updateSubmission("submission", answers, "核对原始问卷")).toEqual({ error: "轮次不存在" })
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["match_round_submissions", "match_rounds"])
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("does not delete retained submissions via an old admin page", async () => {
    expect(await deleteSubmission("submission", "清理原始问卷")).toEqual({ error: "轮次不存在" })
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["match_round_submissions", "match_rounds"])
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
