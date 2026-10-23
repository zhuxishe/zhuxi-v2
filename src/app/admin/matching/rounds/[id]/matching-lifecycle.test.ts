import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/lib/matching/config"

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), snapshotRpc: vi.fn(), revalidate: vi.fn(), prepare: vi.fn(), run: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from, rpc: mocks.rpc }) }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.snapshotRpc }) }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: async () => ({ id: "admin" }) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
vi.mock("@/lib/matching/run-input", () => ({ prepareMatchingRunInput: mocks.prepare }))
vi.mock("@/lib/matching/run-matching", () => ({ runFullMatching: mocks.run }))
import { runRoundMatching } from "./actions"

const round = { status: "closed", survey_start: "2026-09-01T00:00:00Z", survey_end: "2026-09-28T00:00:00Z" }
const openRound = { ...round, status: "open", survey_end: "2026-10-01T00:00:00Z" }
function query(data: unknown, error: unknown = null) {
  const builder = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), insert: vi.fn(), update: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() }
  for (const method of [builder.select, builder.eq, builder.is, builder.insert, builder.update]) method.mockReturnValue(builder)
  builder.single.mockResolvedValue({ data, error })
  builder.maybeSingle.mockResolvedValue({ data, error })
  return builder
}
function prepared() {
  const candidates = [{ submissionId: "already-matched" }, { submissionId: "new-applicant" }]
  const config = structuredClone(DEFAULT_CONFIG)
  const idMap = new Map(candidates.map((c) => [c.submissionId, c.submissionId]))
  const pairRelations = new Map()
  return {
    snapshotId: "snapshot", capturedAt: "2026-09-29T10:00:00Z", candidates, config, idMap, pairRelations,
    submissions: candidates.map((c) => ({ member_id: c.submissionId })), exclusions: [],
    engineInput: { candidates: structuredClone(candidates), config, idMap: [...idMap], pairRelations: [], algorithm_version: "max_coverage_split:2", adapter_version: 1 },
  }
}
function setupRun(current = openRound) {
  const sessionQuery = query({ id: "session" })
  mocks.from.mockReturnValueOnce(query(current)).mockReturnValueOnce(sessionQuery)
  return sessionQuery
}

describe("matching with captured full-pool inputs", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-29T10:00:00Z"))
    mocks.rpc.mockResolvedValue({ data: { results_ready: true }, error: null })
    mocks.snapshotRpc.mockImplementation(async (name: string) => ({ data: name === "admin_capture_matching_input"
      ? { snapshot_id: "snapshot", captured_at: "2026-09-29T10:00:00Z", source: {} }
      : name === "admin_seal_matching_input" ? { status: "sealed" } : { discarded: true }, error: null }))
    mocks.prepare.mockImplementation(prepared)
    mocks.run.mockReturnValue({ totalCandidates: 2, totalMatched: 0, totalUnmatched: 2, rows: [], unmatchedIds: [] })
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it("withdraws its session instead of overwriting a concurrently reopened round", async () => {
    setupRun(round)
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "MATCH_ROUND_CHANGED" } })
    expect((await runRoundMatching("round", "test", "管理员确认运行匹配")).error).toContain("本次匹配已撤回")
    expect(mocks.rpc).toHaveBeenCalledWith("admin_finalize_matching_session", expect.objectContaining({
      p_session_id: "session", p_round_id: "round", p_expected_status: "closed",
      p_survey_start: round.survey_start, p_survey_end: round.survey_end,
    }))
    expect(mocks.rpc).toHaveBeenCalledWith("admin_delete_operational_record", expect.objectContaining({ p_entity: "match_sessions", p_id: "session" }))
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("finalizes the closed round only after its immutable input is sealed", async () => {
    const sessionQuery = setupRun(round)
    expect(await runRoundMatching("round", "test", "管理员确认运行匹配")).toEqual({ success: true, sessionId: "session" })
    expect(sessionQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ input_snapshot_required: true, config: DEFAULT_CONFIG }))
    expect(mocks.snapshotRpc).toHaveBeenCalledWith("admin_seal_matching_input", expect.objectContaining({ p_snapshot_id: "snapshot", p_session_id: "session", p_actor_admin_id: "admin" }))
    expect(mocks.snapshotRpc.mock.invocationCallOrder[1]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[0])
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_finalize_matching_session", {
      p_session_id: "session", p_round_id: "round", p_expected_status: "closed",
      p_survey_start: round.survey_start, p_survey_end: round.survey_end, p_reason: "管理员确认运行匹配",
    })
  })

  it.each([openRound, { ...openRound, survey_end: round.survey_end }])("keeps ongoing or expired collection open with its original dates", async (current) => {
    setupRun(current)
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
  ])("rejects an ineligible round before capture", async (current, error) => {
    mocks.from.mockReturnValueOnce(query(current))
    expect((await runRoundMatching("round", "test", "管理员确认运行匹配")).error).toContain(error)
    expect(mocks.snapshotRpc).not.toHaveBeenCalled()
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })

  it("withdraws an open run if collection state or dates changed", async () => {
    setupRun()
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "MATCH_ROUND_CHANGED" } })
    expect((await runRoundMatching("round", "test", "管理员确认运行匹配")).error).toContain("本次匹配已撤回")
    expect(mocks.rpc).toHaveBeenCalledWith("admin_finalize_matching_session", expect.objectContaining({
      p_expected_status: "open", p_survey_start: openRound.survey_start, p_survey_end: openRound.survey_end,
    }))
    expect(mocks.rpc).toHaveBeenLastCalledWith("admin_delete_operational_record", expect.objectContaining({ p_entity: "match_sessions", p_id: "session" }))
  })

  it("captures the complete pool again, retaining an already matched applicant and unchanged weights", async () => {
    setupRun()
    expect(await runRoundMatching("round", "all", "管理员运行全报名池匹配")).toEqual({ success: true, sessionId: "session" })
    expect(mocks.snapshotRpc).toHaveBeenNthCalledWith(1, "admin_capture_matching_input", { p_round_id: "round", p_actor_admin_id: "admin", p_reason: "管理员运行全报名池匹配" })
    expect(mocks.run).toHaveBeenCalledWith(
      [{ submissionId: "already-matched" }, { submissionId: "new-applicant" }], DEFAULT_CONFIG, expect.any(Map), expect.any(Map),
    )
    const sealed = mocks.snapshotRpc.mock.calls.find(([name]) => name === "admin_seal_matching_input")?.[1]
    expect(sealed.p_engine_input.candidates).toHaveLength(2)
    expect(sealed.p_engine_input.config).toEqual(DEFAULT_CONFIG)
    expect(mocks.snapshotRpc).not.toHaveBeenCalledWith("admin_discard_matching_input", expect.anything())
  })

  it("captures current inputs afresh for each subsequent run", async () => {
    const firstSession = query({ id: "session-one" })
    const nextSession = query({ id: "session-two" })
    mocks.from.mockReturnValueOnce(query(openRound)).mockReturnValueOnce(firstSession)
      .mockReturnValueOnce(query(openRound)).mockReturnValueOnce(nextSession)
    expect(await runRoundMatching("round", "first", "管理员首次运行匹配")).toEqual({ success: true, sessionId: "session-one" })
    expect(await runRoundMatching("round", "next", "管理员再次运行匹配")).toEqual({ success: true, sessionId: "session-two" })
    expect(mocks.snapshotRpc.mock.calls.filter(([name]) => name === "admin_capture_matching_input")).toHaveLength(2)
    expect(mocks.snapshotRpc).toHaveBeenCalledWith("admin_seal_matching_input", expect.objectContaining({ p_session_id: "session-one" }))
    expect(mocks.snapshotRpc).toHaveBeenCalledWith("admin_seal_matching_input", expect.objectContaining({ p_session_id: "session-two" }))
  })

  it("does not expose a run whose readiness was not committed", async () => {
    setupRun()
    mocks.rpc.mockResolvedValueOnce({ data: { results_ready: false }, error: null })
    expect((await runRoundMatching("round", "test", "管理员确认运行匹配")).error).toContain("本次匹配已撤回")
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("fails closed if source or readiness capture fails", async () => {
    mocks.from.mockReturnValueOnce(query(openRound))
    mocks.snapshotRpc.mockResolvedValueOnce({ data: null, error: { message: "readiness unavailable" } })
    expect((await runRoundMatching("round", "test", "管理员确认运行匹配")).error).toContain("暂时无法检查")
    expect(mocks.from).toHaveBeenCalledTimes(1)
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it("retains registrations and discards a capture with fewer than two eligible members", async () => {
    mocks.from.mockReturnValueOnce(query(openRound))
    const input = prepared()
    mocks.prepare.mockReturnValueOnce({ ...input, candidates: [input.candidates[0]], submissions: [input.submissions[0]], exclusions: [{ member_id: "excluded" }] })
    expect((await runRoundMatching("round", "test", "管理员确认运行匹配")).error).toContain("共 2 人报名，符合本批资格的有 1 人")
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.from).toHaveBeenCalledTimes(1)
    expect(mocks.snapshotRpc).toHaveBeenLastCalledWith("admin_discard_matching_input", { p_snapshot_id: "snapshot", p_actor_admin_id: "admin" })
  })

  it("discards the capture when algorithm computation fails before creating a session", async () => {
    mocks.from.mockReturnValueOnce(query(openRound))
    mocks.run.mockImplementationOnce(() => { throw new Error("compute failed") })
    expect((await runRoundMatching("round", "test", "管理员确认运行匹配")).error).toContain("未生成可发布")
    expect(mocks.snapshotRpc).toHaveBeenLastCalledWith("admin_discard_matching_input", expect.objectContaining({ p_snapshot_id: "snapshot" }))
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })

  it("compensates an unsealed session and never writes or publishes its results", async () => {
    setupRun()
    mocks.snapshotRpc.mockResolvedValueOnce({ data: { snapshot_id: "snapshot" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "snapshot changed" } })
    expect((await runRoundMatching("round", "test", "管理员确认运行匹配")).error).toContain("未生成可发布")
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_delete_operational_record", expect.objectContaining({ p_entity: "match_sessions", p_id: "session" }))
    expect(mocks.from).toHaveBeenCalledTimes(2)
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})
