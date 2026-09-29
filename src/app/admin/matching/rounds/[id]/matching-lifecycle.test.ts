import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from, rpc: mocks.rpc }) }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: async () => ({ id: "admin" }) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
vi.mock("@/lib/matching/build-round-candidates", () => ({ buildRoundCandidates: async () => ({ submissions: [{ member_id: "one" }, { member_id: "two" }], candidates: [] }) }))
vi.mock("@/lib/queries/pair-relations-build", () => ({ fetchPairRelations: async () => new Map() }))
vi.mock("@/lib/matching/run-matching", () => ({ runFullMatching: () => ({ totalCandidates: 2, totalMatched: 0, totalUnmatched: 2, rows: [], unmatchedIds: [] }) }))
import { runRoundMatching } from "./actions"

const round = { status: "closed", survey_start: "2026-09-01T00:00:00Z", survey_end: "2026-09-28T00:00:00Z" }
function query(data: unknown) {
  const builder = { select: vi.fn(), eq: vi.fn(), insert: vi.fn(), update: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() }
  for (const method of [builder.select, builder.eq, builder.insert, builder.update]) method.mockReturnValue(builder)
  builder.single.mockResolvedValue({ data, error: null })
  builder.maybeSingle.mockResolvedValue({ data, error: null })
  return builder
}

describe("matching versus survey reopening", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.rpc.mockResolvedValue({ error: null })
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it("withdraws its session instead of overwriting a concurrently reopened round", async () => {
    const update = query(null)
    mocks.from.mockReturnValueOnce(query(round)).mockReturnValueOnce(query({ id: "session" })).mockReturnValueOnce(update)
    expect((await runRoundMatching("round", "test", "管理员确认运行匹配")).error).toContain("本次匹配已撤回")
    expect(update.eq).toHaveBeenCalledWith("status", "closed")
    expect(update.eq).toHaveBeenCalledWith("survey_start", round.survey_start)
    expect(update.eq).toHaveBeenCalledWith("survey_end", round.survey_end)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_delete_operational_record", expect.objectContaining({ p_entity: "match_sessions", p_id: "session" }))
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("completes normal matching when the closed round and dates have not changed", async () => {
    mocks.from.mockReturnValueOnce(query(round)).mockReturnValueOnce(query({ id: "session" })).mockReturnValueOnce(query({ id: "round" }))
    expect(await runRoundMatching("round", "test", "管理员确认运行匹配")).toEqual({ success: true, sessionId: "session" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
