import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/lib/matching/config"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), authRpc: vi.fn(), from: vi.fn(), revalidate: vi.fn(), prepare: vi.fn(), run: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from, rpc: mocks.authRpc }) }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: async () => ({ id: "admin" }) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
vi.mock("@/lib/matching/run-input", async (original) => ({ ...await original<typeof import("@/lib/matching/run-input")>(), prepareMatchingRunInput: mocks.prepare }))
vi.mock("@/lib/matching/run-matching", () => ({ runFullMatching: mocks.run }))
import { runRoundMatching } from "./actions"
import { resumeRoundMatching, abandonMatchingRun } from "./run-actions"

const requestId = "10000000-0000-4000-8000-000000000001"
const roundId = "20000000-0000-4000-8000-000000000001"
const token = "30000000-0000-4000-8000-000000000001"
const reason = "管理员确认运行完整报名池"
const runRecord = (status = "running", extra = {}) => ({ id: requestId, round_id: roundId, batch_number: 1, status, session_name: "本轮匹配", session_id: null, error_code: null, ...extra })
function input() {
  const candidates = [{ submissionId: "already-matched" }, { submissionId: "new-applicant" }]
  return { candidates, config: structuredClone(DEFAULT_CONFIG), idMap: candidates.map(c => [c.submissionId, c.submissionId]), pairRelations: [], algorithm_version: "max_coverage_split:2", adapter_version: 1 }
}
const started = (extra = {}) => ({ run: runRecord(), acquired: true, lease_token: token, capture: { snapshot_id: "original-snapshot" }, ...extra })
const done = (extra = {}) => ({ run: runRecord("succeeded", { session_id: "original-session", ...extra }), session_id: "original-session" })
const ok = (data: unknown) => ({ data, error: null })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.prepare.mockImplementation(() => ({ engineInput: input() }))
  mocks.run.mockReturnValue({ rows: [{ member_a_id: "already-matched", member_b_id: "new-applicant", group_members: null, total_score: 0, score_breakdown: [], best_slot: "2026-10-27_下午", rank: 1 }], unmatchedIds: [] })
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "admin_begin_matching_run") return ok(started())
    if (name === "admin_get_matching_run") return ok({ run: runRecord() })
    if (name === "admin_complete_matching_run") return ok(done())
    if (name === "admin_fail_matching_run") return ok({ run: runRecord("failed", { error_code: "SAVE_FAILED" }) })
    return ok({ staged: true })
  })
})
afterEach(() => vi.restoreAllMocks())

const start = (id = requestId) => runRoundMatching(roundId, "本轮匹配", reason, id)

describe("durable matching run orchestration", () => {
  it("stages the full pool then commits all results once, without direct session writes or compensation deletes", async () => {
    expect(await start()).toMatchObject({ success: true, sessionId: "original-session", runId: requestId })
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["admin_begin_matching_run", "admin_stage_matching_run", "admin_complete_matching_run"])
    expect(mocks.run).toHaveBeenCalledWith(input().candidates, DEFAULT_CONFIG, new Map(input().idMap as [string, string][]), new Map())
    expect(mocks.rpc).toHaveBeenCalledWith("admin_stage_matching_run", expect.objectContaining({ p_engine_input: input(), p_lease_token: token }))
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.authRpc).not.toHaveBeenCalled()
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/matching/survey")
  })

  it("returns the original success receipt after closed became matched, without capturing or calculating again", async () => {
    mocks.rpc.mockResolvedValueOnce(ok({ ...done(), acquired: false }))
    expect(await start()).toMatchObject({ success: true, sessionId: "original-session" })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it("does not resurrect an explicitly deleted successful plan", async () => {
    mocks.rpc.mockResolvedValueOnce(ok({ run: runRecord("succeeded", { session_deleted: true }), acquired: false }))
    expect(await start()).toMatchObject({ sessionDeleted: true, status: "succeeded" })
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it("never treats a same-owner receipt from another round as this round's success", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "MATCH_RUN_REQUEST_REUSED" } })
    mocks.rpc.mockResolvedValueOnce(ok(done({ round_id: "other-round" })))
    const result = await start()
    expect(result.error).toContain("其他轮次")
    expect(result.sessionId).toBeUndefined()
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it("keeps the same operation pending while another worker holds its lease", async () => {
    mocks.rpc.mockResolvedValueOnce(ok({ run: runRecord(), acquired: false }))
    expect(await start()).toMatchObject({ busy: true, runId: requestId })
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it("new operation IDs are forwarded as separate runs and never delete the old plan", async () => {
    const nextId = "10000000-0000-4000-8000-000000000002"
    await start(); await start(nextId)
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "admin_begin_matching_run").map(([,args]) => args.p_request_id)).toEqual([requestId, nextId])
    expect(mocks.rpc.mock.calls.some(([name]) => name.includes("delete") || name.includes("discard"))).toBe(false)
  })

  it("recovers the staged original engine input without reading or remapping current forms", async () => {
    const original = input(); original.candidates[0].submissionId = "original-member"
    mocks.rpc.mockResolvedValueOnce(ok({ run: runRecord("failed") }))
    mocks.rpc.mockResolvedValueOnce(ok(started({ engine_input: original })))
    expect(await resumeRoundMatching(requestId, "使用原始输入恢复本次运行")).toMatchObject({ success: true })
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.run.mock.calls[0][0][0].submissionId).toBe("original-member")
    expect(mocks.rpc.mock.calls.some(([name]) => name === "admin_stage_matching_run")).toBe(false)
  })

  it("records insufficient eligibility without deleting registrations or the captured input", async () => {
    const engine = input(); engine.candidates.pop()
    mocks.prepare.mockReturnValueOnce({ engineInput: engine })
    mocks.rpc.mockImplementationOnce(async () => ok(started()))
    mocks.rpc.mockImplementationOnce(async () => ok({ run: runRecord() }))
    mocks.rpc.mockImplementationOnce(async () => ok({ run: runRecord("failed", { error_code: "CANDIDATES_INSUFFICIENT" }) }))
    expect((await start()).error).toContain("不足2人")
    expect(mocks.rpc).toHaveBeenLastCalledWith("admin_fail_matching_run", expect.objectContaining({ p_error_code: "CANDIDATES_INSUFFICIENT" }))
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it("keeps a failed capture visible, requiring explicit abandonment rather than silently recapturing", async () => {
    mocks.rpc.mockResolvedValueOnce(ok({ run: runRecord("failed", { error_code: "INPUT_CAPTURE_FAILED" }), acquired: false }))
    expect(await start()).toMatchObject({ status: "failed", runId: requestId })
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it("preserves the run after an engine exception and stores only a safe failure code", async () => {
    mocks.run.mockImplementationOnce(() => { throw new Error("private candidate payload") })
    await start()
    expect(mocks.rpc).toHaveBeenLastCalledWith("admin_fail_matching_run", expect.objectContaining({ p_error_code: "ENGINE_FAILED" }))
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("private candidate payload")
  })

  it("queries the receipt after a lost completion response and returns success without marking failure or deleting", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_begin_matching_run") return ok(started())
      if (name === "admin_complete_matching_run") return { data: null, error: { message: "response lost" } }
      if (name === "admin_get_matching_run") return ok(done())
      return ok({ staged: true })
    })
    expect(await start()).toMatchObject({ success: true, sessionId: "original-session" })
    expect(mocks.rpc.mock.calls.some(([name]) => name === "admin_fail_matching_run")).toBe(false)
  })

  it("also reconciles a begin response lost after an earlier successful run", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("network")); mocks.rpc.mockResolvedValueOnce(ok(done()))
    expect(await start()).toMatchObject({ success: true, sessionId: "original-session" })
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it("keeps unknown status pending when receipt lookup and failure recording are both unavailable", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_begin_matching_run") return ok(started())
      if (name === "admin_stage_matching_run") return ok({ staged: true })
      throw new Error("network unavailable")
    })
    expect(await start()).toMatchObject({ busy: true, runId: requestId, status: "running" })
    expect(mocks.rpc.mock.calls.some(([name]) => name.includes("delete"))).toBe(false)
  })

  it("refuses to remap an engine captured by an unsupported algorithm version", async () => {
    const engine = { ...input(), algorithm_version: "unknown-version" }
    mocks.rpc.mockResolvedValueOnce(ok(started({ engine_input: engine })))
    await start()
    expect(mocks.rpc).toHaveBeenLastCalledWith("admin_fail_matching_run", expect.objectContaining({ p_error_code: "VERSION_UNSUPPORTED" }))
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled()
  })

  it("forwards explicit abandonment through the authenticated audited RPC only", async () => {
    mocks.authRpc.mockResolvedValueOnce(ok({ run: runRecord("abandoned") }))
    expect(await abandonMatchingRun(requestId, "明确作废失败运行保留记录")).toMatchObject({ success: true, status: "abandoned" })
    expect(mocks.authRpc).toHaveBeenCalledExactlyOnceWith("admin_abandon_matching_run", { p_run_id: requestId, p_reason: "明确作废失败运行保留记录" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("requires a valid operation ID and audit reason before any privileged call", async () => {
    expect((await start("invalid")).error).toContain("编号无效")
    expect((await runRoundMatching(roundId, "test", "", requestId)).error).toBeTruthy()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
