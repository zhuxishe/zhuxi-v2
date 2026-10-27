import { beforeEach, describe, expect, it, vi } from "vitest"
import { createScoringV3Config } from "./scoring-policy"
import type { MatchingEngineInput } from "./run-input"
import type { MatchingAdjustmentReceipt, MatchingAdjustmentRecord } from "./adjustment-types"
const mocks = vi.hoisted(() => ({ admin: vi.fn(), db: vi.fn(), invalidate: vi.fn(), prepare: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.db }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.invalidate }))
vi.mock("./run-input", async (original) => ({ ...await original<typeof import("./run-input")>(), prepareMatchingRunInput: mocks.prepare }))
import { performMatchingAdjustment, recoverMatchingAdjustmentOperation, inspectMatchingAdjustment, fetchMatchingAdjustmentPreview, fetchMatchingAdjustmentRecords } from "./adjustment-service"

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const sessionId = id(101), operationId = id(102), actorId = id(103), resultId = id(104), reason = "管理员核对后进行匹配调整"
function engine(n = 2): MatchingEngineInput {
  const policy = { version: "weighted_feedback:1" as const, quizVersionId: "published", dimensionWeights: { E: .3, A: .3, O: .15, C: .1, N: .15 }, activityFeedback: [] }
  return { algorithm_version: "max_coverage_split:3", adapter_version: 2, config: createScoringV3Config(policy), pairRelations: [],
    idMap: Array.from({ length: n }, (_, i) => [id(i + 1), id(i + 1)]),
    candidates: Array.from({ length: n }, (_, i) => ({ submissionId: id(i + 1), name: `测试${i + 1}`, gameTypePref: "都可以", genderPref: "都可以", availability: { "2026-10-24": ["下午"] }, formInterestTags: [], formSocialStyle: null, gender: "女", school: "同校", interestTags: ["电影"], scoringInterestTags: ["电影"], socialTags: [], level: 2, compatibilityScore: 4, matchHistory: [], gameMode: "推理", hasProfile: true })) }
}
function record(kind: MatchingAdjustmentRecord["kind"] = "manual", members = [id(1), id(2)]): MatchingAdjustmentRecord {
  return { id: operationId, session_id: sessionId, round_id: id(100), kind, member_ids: members, result_id: null, actor_admin_id: actorId, status: "running", attempt: 1, created_at: "2026-10-24T00:00:00Z", updated_at: "2026-10-24T00:00:00Z", captured_at: "2026-10-24T00:00:00Z", base_revision: "fingerprint", submitted_count: members.length, eligible_count: members.length, excluded_count: 0, exclusion_summary: [], has_existing_multi_pool: false, error_code: null, can_recover: false }
}
function fixture(input = engine(), operation = record()) {
  const receipt: MatchingAdjustmentReceipt = { operation, acquired: true, lease_token: id(105), capture: { frozen: "private" }, selected_member_ids: input.idMap.map(([, value]) => value), has_existing_multi_pool: false }
  const complete = vi.fn().mockResolvedValue({ data: { operation: { ...operation, status: "succeeded" } }, error: null })
  const get = vi.fn().mockResolvedValue({ data: { ...receipt, acquired: false }, error: null })
  const begin = vi.fn().mockResolvedValue({ data: receipt, error: null })
  const stage = vi.fn().mockResolvedValue({ data: receipt, error: null })
  const fail = vi.fn().mockImplementation(async (args: { p_error_code: string }) => ({ data: { operation: { ...operation, status: "failed", error_code: args.p_error_code } }, error: null }))
  const preview = vi.fn().mockResolvedValue({ data: { capture: receipt.capture, selected_member_ids: receipt.selected_member_ids, has_existing_multi_pool: false, base_revision: "fingerprint", summary: { submitted_count: input.candidates.length, eligible_count: input.candidates.length, excluded_count: 0, exclusion_summary: [] }, available_members: [{ id: id(1), name: "可选成员" }], excluded_members: [] }, error: null })
  const list = vi.fn().mockResolvedValue({ data: [{ ...operation, unexpected: "PRIVATE-CAPTURE" }], error: null })
  const handlers: Record<string, (args: Record<string, unknown>) => unknown> = { admin_begin_matching_adjustment: begin, admin_stage_matching_adjustment: stage, admin_complete_matching_adjustment: complete, admin_get_matching_adjustment: get, admin_fail_matching_adjustment: fail, admin_preview_matching_adjustment: preview, admin_list_matching_adjustments: list }
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => { if (!handlers[name]) throw new Error(name); return handlers[name](args) })
  mocks.db.mockReturnValue({ rpc }); mocks.prepare.mockReturnValue({ engineInput: input })
  return { receipt, complete, get, begin, stage, fail, preview, list, rpc }
}
const perform = (overrides: Partial<Parameters<typeof performMatchingAdjustment>[0]> = {}) => performMatchingAdjustment({ sessionId, kind: "manual", memberIds: [id(1), id(2)], rawReason: reason, operationId, ...overrides })
beforeEach(() => { vi.resetAllMocks(); mocks.admin.mockResolvedValue({ id: actorId, role: "super_admin" }) })

describe("controlled matching adjustment lifecycle", () => {
  it("requires an operation ID and rejects duplicated or insufficient selections before writes", async () => {
    expect(await perform({ operationId: undefined })).toEqual({ error: expect.stringContaining("操作编号") })
    expect(await perform({ memberIds: [id(1), id(1)] })).toEqual({ error: "不能重复选择同一名成员" })
    expect(await perform({ memberIds: [id(1)] })).toEqual({ error: "至少需要 2 人" })
    expect(mocks.db).not.toHaveBeenCalled()
  })
  it("stages current v3 input and atomically saves scored rows using the original operation and revision", async () => {
    const f = fixture()
    expect(await perform({ expectedRevision: "checked" })).toMatchObject({ success: true, operationId, matchCount: 1 })
    expect(f.begin).toHaveBeenCalledWith(expect.objectContaining({ p_operation_id: operationId, p_expected_revision: "checked" }))
    expect(f.stage).toHaveBeenCalledWith(expect.objectContaining({ p_engine: expect.objectContaining({ algorithm_version: "max_coverage_split:3", adapter_version: 2 }) }))
    const payload = f.complete.mock.calls[0][0]
    expect(payload.p_rows[0]).toMatchObject({ member_a_id: id(1), member_b_id: id(2), group_members: null })
    expect(payload.p_rows[0].total_score).toBeGreaterThan(0)
    expect(payload.p_rows[0].score_breakdown).toEqual(expect.arrayContaining([expect.objectContaining({ factor: "activity_feedback" })]))
    expect(payload.p_unmatched_ids).toEqual([]); expect(payload.p_diagnostics).toEqual([])
  })
  it("rejects multiplayer-only plus flexible as a duo without an insert or force bypass", async () => {
    const e = engine(); e.candidates[0].gameTypePref = "多人"
    const f = fixture(e)
    expect(await perform()).toMatchObject({ status: "failed", error: expect.stringContaining("不能强制") })
    expect(f.complete).not.toHaveBeenCalled()
    expect(f.fail).toHaveBeenCalledWith(expect.objectContaining({ p_error_code: "CONSTRAINTS_FAILED" }))
  })
  it("keeps all thirteen members in one scored pool with one real common time", async () => {
    const e = engine(13), ids = e.idMap.map(([, value]) => value), f = fixture(e, record("manual", ids))
    expect(await perform({ memberIds: ids })).toMatchObject({ success: true })
    const row = f.complete.mock.calls[0][0].p_rows[0]
    expect(row.group_members).toEqual(ids); expect(row.total_score).toBeGreaterThan(0)
    expect(row.score_breakdown).toMatchObject({ kind: "multi_pool" })
  })
  it("will not create a second effective multiplayer pool", async () => {
    const e = engine(3), ids = e.idMap.map(([, value]) => value), f = fixture(e, record("manual", ids))
    f.receipt.has_existing_multi_pool = true
    expect(await perform({ memberIds: ids })).toMatchObject({ status: "failed" })
    expect(f.complete).not.toHaveBeenCalled()
  })
  it("lets a qualified pool remainder run and saves trusted unmatched diagnostics without touching outside candidates", async () => {
    const e = engine(3); e.candidates.forEach((c) => { c.gameTypePref = "多人" })
    const f = fixture(e, record("pool", [])); f.receipt.has_existing_multi_pool = true
    expect(await perform({ kind: "pool", memberIds: undefined })).toMatchObject({ success: true, matchCount: 0 })
    const payload = f.complete.mock.calls[0][0]
    expect(payload.p_rows).toEqual([]); expect(payload.p_unmatched_ids).toEqual([id(1), id(2), id(3)])
    expect(payload.p_diagnostics).toHaveLength(3)
    expect(payload.p_diagnostics[0].details).toMatchObject({ version: "matching_diagnostic:1", code: "not_selected", cohort_size: 3 })
  })
  it("stops an insufficient eligible pool before staging, retaining original records", async () => {
    const f = fixture(engine(1), record("pool", []))
    expect(await perform({ kind: "pool", memberIds: undefined })).toMatchObject({ status: "failed", error: expect.stringContaining("不足2人") })
    expect(f.stage).not.toHaveBeenCalled(); expect(f.complete).not.toHaveBeenCalled()
  })
  it("restores only when the original recommended time remains shared", async () => {
    const op = { ...record("restore", []), result_id: resultId }, f = fixture(engine(), op)
    f.receipt.result_snapshot = { best_slot: "2026-10-24_晚上" }
    expect(await perform({ kind: "restore", memberIds: undefined, resultId })).toMatchObject({ status: "failed", error: expect.stringContaining("原推荐时间") })
    expect(f.complete).not.toHaveBeenCalled()
    f.receipt.result_snapshot = { best_slot: "2026-10-24_下午" }
    expect(await perform({ kind: "restore", memberIds: undefined, resultId })).toMatchObject({ success: true })
  })
  it("accepts the existing space-separated saved time when restoring without replacing it", async () => {
    const f = fixture(engine(), { ...record("restore", []), result_id: resultId })
    f.receipt.result_snapshot = { best_slot: "2026-10-24 下午" }
    expect(await perform({ kind: "restore", memberIds: undefined, resultId })).toMatchObject({ success: true })
    expect(f.receipt.result_snapshot.best_slot).toBe("2026-10-24 下午")
  })
  it.each([
    ["MATCH_ADJUSTMENT_MEMBER_INELIGIBLE", "MEMBER_INELIGIBLE", "不符合匹配资格"],
    ["MATCH_ADJUSTMENT_MEMBER_OCCUPIED", "MEMBER_OCCUPIED", "其他有效结果"],
    ["MATCH_ADJUSTMENT_CONSTRAINT", "CONSTRAINTS_FAILED", "不能强制"],
    ["MATCH_ADJUSTMENT_ORIGINAL_TIME_UNAVAILABLE", "ORIGINAL_TIME_UNAVAILABLE", "原推荐时间"],
  ])("classifies hard commit refusal %s as a terminal actionable failure", async (message, code, expected) => {
    const f = fixture(); f.complete.mockResolvedValue({ data: null, error: { code: "PT409", message } })
    expect(await perform()).toMatchObject({ status: "failed", error: expect.stringContaining(expected) })
    expect(f.fail).toHaveBeenCalledWith(expect.objectContaining({ p_error_code: code }))
  })
  it("turns a grouped-board refusal at commit into a terminal changed-operation record and directs edits to the board", async () => {
    const f = fixture(); f.complete.mockResolvedValue({ data: null, error: { code: "PT409", message: "MATCH_ADJUSTMENT_BOARD_GROUPED:PRIVATE-DETAIL" } })
    const result = await perform()
    expect(result).toMatchObject({ status: "failed", error: expect.stringContaining("三池子页面") })
    expect(JSON.stringify(result)).not.toContain("PRIVATE-DETAIL")
    expect(f.fail).toHaveBeenCalledWith(expect.objectContaining({ p_error_code: "ADJUSTMENT_CHANGED" }))
  })
  it("never rebuilds current forms when both frozen capture and staged input are unavailable", async () => {
    const f = fixture(); f.receipt.capture = null; f.receipt.engine_input = null
    expect(await perform()).toMatchObject({ status: "failed", error: expect.stringContaining("原输入不可用") })
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(f.complete).not.toHaveBeenCalled()
  })
  it("cancels only a result via one atomic operation, without preparing or changing registration", async () => {
    const f = fixture(engine(), { ...record("split", []), result_id: resultId })
    expect(await perform({ kind: "split", memberIds: undefined, resultId })).toMatchObject({ success: true })
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(f.stage).not.toHaveBeenCalled()
    expect(f.complete).toHaveBeenCalledWith(expect.objectContaining({ p_rows: [], p_unmatched_ids: [], p_diagnostics: [] }))
  })
  it("reads a successful receipt after losing the commit response instead of compensating or retrying with a new ID", async () => {
    const f = fixture()
    f.complete.mockRejectedValue(new Error("lost after commit"))
    f.get.mockResolvedValue({ data: { operation: { ...f.receipt.operation, status: "succeeded" } }, error: null })
    expect(await perform()).toMatchObject({ success: true, operationId })
    expect(f.fail).not.toHaveBeenCalled(); expect(f.begin).toHaveBeenCalledTimes(1)
  })
  it("recovers exactly the saved engine input, not current profile or answers", async () => {
    const old = engine(), f = fixture(old)
    f.receipt.engine_input = old
    mocks.prepare.mockImplementation(() => { throw new Error("live data must not be rebuilt") })
    expect(await recoverMatchingAdjustmentOperation(sessionId, operationId, reason)).toMatchObject({ success: true, operationId })
    expect(f.stage).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled()
    expect(f.begin).toHaveBeenCalledWith(expect.objectContaining({ p_operation_id: operationId, p_member_ids: [id(1), id(2)] }))
  })
  it("does not report another selection's successful receipt as this request's success", async () => {
    const f = fixture()
    f.begin.mockResolvedValue({ data: null, error: { message: "MATCHING_ADJUSTMENT_ID_REUSE" } })
    f.get.mockResolvedValue({ data: { operation: { ...f.receipt.operation, member_ids: [id(1), id(3)], status: "succeeded" } }, error: null })
    expect(await perform()).toMatchObject({ error: expect.stringContaining("其他调整") })
    expect(f.complete).not.toHaveBeenCalled()
  })
  it("fails closed on a stale revision without writes", async () => {
    const f = fixture(); f.begin.mockResolvedValue({ data: null, error: { message: "MATCHING_ADJUSTMENT_STALE" } }); f.get.mockResolvedValue({ data: null, error: null })
    expect(await perform()).toMatchObject({ error: expect.stringContaining("本次未保存") })
    expect(f.stage).not.toHaveBeenCalled(); expect(f.complete).not.toHaveBeenCalled()
  })
  it.each([
    ["MATCH_ADJUSTMENT_CANDIDATES_INSUFFICIENT", "不足2人"],
    ["MATCH_ADJUSTMENT_REQUIRES_DRAFT", "先撤回"],
    ["MATCH_ADJUSTMENT_NOT_RECOVERABLE", "不能继续恢复"],
    ["MATCH_ADJUSTMENT_BOARD_GROUPED", "三池子页面"],
  ])("distinguishes known pre-creation refusal %s from an unknown network result", async (message, expected) => {
    const f = fixture(); f.begin.mockResolvedValue({ data: null, error: { code: "PT409", message } }); f.get.mockResolvedValue({ data: null, error: null })
    expect(await perform()).toMatchObject({ busy: false, operationId, error: expect.stringContaining(expected) })
    expect(f.stage).not.toHaveBeenCalled(); expect(f.complete).not.toHaveBeenCalled(); expect(f.fail).not.toHaveBeenCalled()
  })
  it("keeps a transport error response unknown until its original receipt can be read", async () => {
    const f = fixture(); f.begin.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } }); f.get.mockResolvedValue({ data: null, error: null })
    expect(await perform()).toMatchObject({ busy: true, operationId, error: expect.stringContaining("请勿重复新增") })
  })
  it("does not report another administrator's matching receipt as this actor's operation", async () => {
    const f = fixture(); f.begin.mockResolvedValue({ data: null, error: { code: "PT409", message: "MATCH_ADJUSTMENT_REQUEST_CONFLICT" } })
    f.get.mockResolvedValue({ data: { operation: { ...f.receipt.operation, actor_admin_id: id(999), status: "succeeded" } }, error: null })
    expect(await perform()).toMatchObject({ error: expect.stringContaining("其他调整") })
    expect(await recoverMatchingAdjustmentOperation(sessionId, operationId, reason)).toMatchObject({ error: expect.stringContaining("发起本次调整") })
    expect(f.complete).not.toHaveBeenCalled()
  })
  it("keeps unknown failure status explicit and retains the original ID", async () => {
    const f = fixture(); f.complete.mockRejectedValue(new Error("offline")); f.get.mockRejectedValue(new Error("offline")); f.fail.mockRejectedValue(new Error("offline"))
    expect(await perform()).toMatchObject({ operationId, busy: true, error: expect.stringContaining("请勿重复新增") })
  })
})

describe("adjustment read boundaries", () => {
  it("uses the same authoritative capture for final-selection preview", async () => {
    const e = engine(); e.candidates[0].gameTypePref = "多人"; const f = fixture(e)
    const response = await inspectMatchingAdjustment(sessionId, [id(1), id(2)])
    expect(response).toMatchObject({ revisionToken: "fingerprint", canViewRaw: true, inspection: { passed: false } })
    expect(f.preview).toHaveBeenCalledWith(expect.objectContaining({ p_kind: "manual", p_member_ids: [id(1), id(2)] }))
  })
  it("redacts scoring detail at the inspection boundary for an ordinary administrator", async () => {
    fixture(); mocks.admin.mockResolvedValue({ id: actorId, role: "admin" })
    const response = await inspectMatchingAdjustment(sessionId, [id(1), id(2)])
    expect(response.canViewRaw).toBe(false)
    expect(response.inspection.rows[0].total_score).toBeGreaterThan(0)
    expect(response.inspection.rows[0].score_breakdown).toBeNull()
    expect(JSON.stringify(response)).not.toContain("activity_feedback")
  })
  it("redacts private relation notes before a failed inspection can leave the service", async () => {
    const e = engine(); e.pairRelations.push([`${id(1)}||${id(2)}`, { playerA: id(1), playerB: id(2), status: "blacklist", reason: "PRIVATE-OTHER-IDENTITY", totalPairCount: 1, hasMutualFive: false }])
    fixture(e); mocks.admin.mockResolvedValue({ id: actorId, role: "admin" })
    const response = await inspectMatchingAdjustment(sessionId, [id(1), id(2)])
    expect(response.inspection.passed).toBe(false)
    expect(response.inspection.reasons).toEqual(["存在不满足的匹配约束"])
    expect(JSON.stringify(response)).not.toContain("PRIVATE-OTHER-IDENTITY")
  })
  it("sends only safe eligibility/options metadata to the page, never capture or staging fields", async () => {
    fixture()
    const response = await fetchMatchingAdjustmentPreview(sessionId, "pool")
    expect(response.eligible_count).toBe(2); expect(JSON.stringify(response)).not.toMatch(/private|capture|engine_input/)
  })
  it("returns no unknown record properties, actor ID or selected members to ordinary admins", async () => {
    fixture(); mocks.admin.mockResolvedValue({ id: actorId, role: "admin" })
    const records = await fetchMatchingAdjustmentRecords(sessionId)
    expect(records[0].actor_admin_id).toBe(""); expect(records[0].member_ids).toEqual([])
    expect(JSON.stringify(records)).not.toContain("PRIVATE-CAPTURE")
  })
  it("does not make service-role calls before administrator authorization succeeds", async () => {
    fixture(); mocks.admin.mockRejectedValue(new Error("denied"))
    await expect(fetchMatchingAdjustmentPreview(sessionId)).rejects.toThrow("denied")
    expect(mocks.db).not.toHaveBeenCalled()
  })
})
