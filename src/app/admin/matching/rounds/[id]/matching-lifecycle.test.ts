import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), candidates: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from, rpc: mocks.rpc }) }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: async () => ({ id: "admin" }) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
vi.mock("@/lib/matching/build-round-candidates", () => ({ buildRoundCandidates: mocks.candidates }))
vi.mock("@/lib/queries/pair-relations-build", () => ({ fetchPairRelations: async () => new Map() }))
vi.mock("@/lib/matching/run-matching", () => ({ runFullMatching: () => ({ totalCandidates: 2, totalMatched: 0, totalUnmatched: 2, rows: [], unmatchedIds: [] }) }))
import { runRoundMatching } from "./actions"

const round = { status: "closed", survey_start: "2026-09-01T00:00:00Z", survey_end: "2026-09-28T00:00:00Z" }
const openRound = { ...round, status: "open", survey_end: "2026-10-01T00:00:00Z" }
function query(data: unknown) {
  const builder = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), insert: vi.fn(), update: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() }
  for (const method of [builder.select, builder.eq, builder.is, builder.insert, builder.update]) method.mockReturnValue(builder)
  builder.single.mockResolvedValue({ data, error: null })
  builder.maybeSingle.mockResolvedValue({ data, error: null })
  return builder
}

describe("matching versus survey reopening", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-29T10:00:00Z"))
    mocks.rpc.mockResolvedValue({ data: { results_ready: true }, error: null })
    mocks.candidates.mockResolvedValue({ submissions: [{ member_id: "one" }, { member_id: "two" }], candidates: [] })
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it("withdraws its session instead of overwriting a concurrently reopened round", async () => {
    mocks.from.mockReturnValueOnce(query(round)).mockReturnValueOnce(query({ id: "session" }))
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "MATCH_ROUND_CHANGED" } })
    expect((await runRoundMatching("round", "test", "管理员确认运行匹配")).error).toContain("本次匹配已撤回")
    expect(mocks.rpc).toHaveBeenCalledWith("admin_finalize_matching_session", expect.objectContaining({
      p_session_id: "session", p_round_id: "round", p_expected_status: "closed",
      p_survey_start: round.survey_start, p_survey_end: round.survey_end,
    }))
    expect(mocks.rpc).toHaveBeenCalledWith("admin_delete_operational_record", expect.objectContaining({ p_entity: "match_sessions", p_id: "session" }))
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("completes normal matching when the closed round and dates have not changed", async () => {
    mocks.from.mockReturnValueOnce(query(round)).mockReturnValueOnce(query({ id: "session" }))
    expect(await runRoundMatching("round", "test", "管理员确认运行匹配")).toEqual({ success: true, sessionId: "session" })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_finalize_matching_session", {
      p_session_id: "session", p_round_id: "round", p_expected_status: "closed",
      p_survey_start: round.survey_start, p_survey_end: round.survey_end, p_reason: "管理员确认运行匹配",
    })
  })

  it.each([openRound, { ...openRound, survey_end: round.survey_end }])("keeps an open or expired collection open and preserves its original dates", async (current) => {
    mocks.from.mockReturnValueOnce(query(current)).mockReturnValueOnce(query({ id: "session" }))
    expect(await runRoundMatching("round", "test", "管理员确认运行匹配")).toEqual({ success: true, sessionId: "session" })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_finalize_matching_session", {
      p_session_id: "session", p_round_id: "round", p_expected_status: "open",
      p_survey_start: current.survey_start, p_survey_end: current.survey_end, p_reason: "管理员确认运行匹配",
    })
  })

  it.each([
    [{ ...openRound, survey_start: "2026-09-30T00:00:00Z" }, "尚未到开放"],
    [{ ...openRound, survey_start: "invalid" }, "配置无效"],
    [{ ...openRound, survey_end: openRound.survey_start }, "配置无效"],
    [{ ...round, status: "draft" }, "只有已开放"],
    [{ ...round, status: "matched" }, "只有已开放"],
  ])("rejects an ineligible round before loading candidates", async (current, error) => {
    mocks.from.mockReturnValueOnce(query(current))
    expect((await runRoundMatching("round", "test", "管理员确认运行匹配")).error).toContain(error)
    expect(mocks.candidates).not.toHaveBeenCalled()
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })

  it("withdraws an open run if its collection state, dates or deletion status changed", async () => {
    mocks.from.mockReturnValueOnce(query(openRound)).mockReturnValueOnce(query({ id: "session" }))
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "MATCH_ROUND_CHANGED" } })
    expect((await runRoundMatching("round", "test", "管理员确认运行匹配")).error).toContain("本次匹配已撤回")
    expect(mocks.rpc).toHaveBeenCalledWith("admin_finalize_matching_session", expect.objectContaining({
      p_expected_status: "open", p_survey_start: openRound.survey_start, p_survey_end: openRound.survey_end,
    }))
    expect(mocks.rpc).toHaveBeenCalledWith("admin_delete_operational_record", expect.objectContaining({ p_entity: "match_sessions", p_id: "session" }))
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("loads current submissions again and creates a separate session on a later open run", async () => {
    const firstSession = query({ id: "session-one" })
    const nextSession = query({ id: "session-two" })
    mocks.from
      .mockReturnValueOnce(query(openRound)).mockReturnValueOnce(firstSession)
      .mockReturnValueOnce(query(openRound)).mockReturnValueOnce(nextSession)
    expect(await runRoundMatching("round", "first", "管理员首次运行匹配")).toEqual({ success: true, sessionId: "session-one" })
    expect(await runRoundMatching("round", "next", "管理员再次运行匹配")).toEqual({ success: true, sessionId: "session-two" })
    expect(mocks.candidates).toHaveBeenNthCalledWith(1, "round")
    expect(mocks.candidates).toHaveBeenNthCalledWith(2, "round")
    expect(firstSession.insert).toHaveBeenCalledWith(expect.objectContaining({ session_name: "first", round_id: "round" }))
    expect(nextSession.insert).toHaveBeenCalledWith(expect.objectContaining({ session_name: "next", round_id: "round" }))
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "admin_finalize_matching_session", expect.objectContaining({ p_session_id: "session-one", p_expected_status: "open" }))
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "admin_finalize_matching_session", expect.objectContaining({ p_session_id: "session-two", p_expected_status: "open" }))
  })

  it("does not expose a run whose readiness was not committed", async () => {
    mocks.from.mockReturnValueOnce(query(openRound)).mockReturnValueOnce(query({ id: "session" }))
    mocks.rpc.mockResolvedValueOnce({ data: { results_ready: false }, error: null })
    expect((await runRoundMatching("round", "test", "管理员确认运行匹配")).error).toContain("本次匹配已撤回")
    expect(mocks.rpc).toHaveBeenLastCalledWith("admin_delete_operational_record", expect.objectContaining({ p_entity: "match_sessions", p_id: "session" }))
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})
