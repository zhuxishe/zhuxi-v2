import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ImportPlan, ImportReceipt } from "./round-import-contract"
import { importDigest, signImportPlan, verifyImportPlan } from "./round-import-plan"

const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), from: vi.fn(), createAdminClient: vi.fn() }))
vi.mock("./round-import-context", () => ({ loadRoundImportReviewContext: mocks.context }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
import { cancelRoundImportOperation, getRoundImportReceiptRecord, importRoundWorkbook, listRoundImportRecords, previewRoundWorkbook } from "./round-import-service"

const roundId = "10000000-0000-4000-8000-000000000001"
const actorId = "10000000-0000-4000-8000-000000000002"
const requestId = "10000000-0000-4000-8000-000000000003"
const memberId = "20000000-0000-4000-8000-000000000001"
const reason = "根据本轮报名表追加更新成员"
const summary = { totalRows: 1, currentCount: 1, legacyCount: 0, tempCount: 0, warningCount: 0, insertedCount: 1, updatedCount: 0, unchangedCount: 0, affectedBatchIds: [] }
const receipt: ImportReceipt = { id: requestId, round_id: roundId, status: "succeeded", created_at: "2026-10-23T00:00:00Z", completed_at: "2026-10-23T00:00:01Z", reason, error_code: null, error_message: null, summary }
function plan(patch: Partial<ImportPlan> = {}): ImportPlan {
  return { version: 1, roundId, actorId, fileHash: "a".repeat(64), roundToken: "round-token", expiresAt: Date.now() + 10_000, rows: [{ row_number: 4, source: "current", identity_key: null, existing_member_id: memberId, expected_member_token: "member-token", expected_submission: null, answers: { game_type_pref: "双人", gender_pref: "都可以", availability: { "2026-10-27": ["下午"] }, message: null, import_metadata: null }, temp_profile: null }], ...patch }
}

describe("transactional round Excel import service", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "isolated-import-service-test-key")
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc, from: mocks.from })
    mocks.rpc.mockResolvedValue({ data: receipt, error: null })
    mocks.from.mockImplementation(() => { throw new Error("Import orchestration must use only atomic RPCs") })
  })
  afterEach(() => { vi.unstubAllEnvs() })

  it("validates request IDs and reasons before opening a database client", async () => {
    await expect(importRoundWorkbook(roundId, actorId, "not-a-uuid", "token", reason)).rejects.toThrow("导入编号无效")
    await expect(importRoundWorkbook(roundId, actorId, requestId, "token", "短因")).rejects.toThrow("导入原因需为 4-500 个字符")
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it("submits the exact signed review, actor, version and content fingerprint in one atomic RPC", async () => {
    const reviewed = plan()
    await expect(importRoundWorkbook(roundId, actorId, requestId, signImportPlan(reviewed), `  ${reason}  `)).resolves.toEqual(receipt)
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_apply_round_import", {
      p_request_id: requestId, p_round_id: roundId, p_actor_admin_id: actorId,
      p_request_hash: importDigest({ plan: reviewed, reason }), p_file_sha256: reviewed.fileHash,
      p_reason: reason, p_expected_round_token: reviewed.roundToken, p_rows: reviewed.rows,
    })
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.context).not.toHaveBeenCalled()
  })

  it("rejects a changed signature or actor before issuing database writes", async () => {
    const token = signImportPlan(plan())
    await expect(importRoundWorkbook(roundId, "other-actor", requestId, token, reason)).rejects.toThrow("不一致")
    await expect(importRoundWorkbook(roundId, actorId, requestId, `${token}tamper`, reason)).rejects.toThrow("失效")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("leaves a transport failure ambiguous and never compensates by deleting answers or members", async () => {
    const transport = { message: "response lost after commit" }
    mocks.rpc.mockResolvedValue({ data: null, error: transport })
    await expect(importRoundWorkbook(roundId, actorId, requestId, signImportPlan(plan()), reason)).rejects.toEqual(transport)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it("does not report success without a receipt", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    await expect(importRoundWorkbook(roundId, actorId, requestId, signImportPlan(plan()), reason)).rejects.toThrow("未收到导入回执")
  })

  it("returns a durable all-or-nothing failure receipt to the action", async () => {
    const failed: ImportReceipt = { ...receipt, status: "failed", error_code: "IMPORT_SUBMISSION_CHANGED", error_message: "线上答卷已变化，本次未写入，请重新预览并处理差异" }
    mocks.rpc.mockResolvedValue({ data: failed, error: null })
    await expect(importRoundWorkbook(roundId, actorId, requestId, signImportPlan(plan()), reason)).resolves.toEqual(failed)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it("refuses to apply an expired review when no committed operation exists", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    await expect(importRoundWorkbook(roundId, actorId, requestId, signImportPlan(plan({ expiresAt: Date.now() - 1 })), reason)).rejects.toThrow("导入预览已过期")
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_get_round_import", { p_request_id: requestId, p_round_id: roundId, p_actor_admin_id: actorId })
  })

  it("checks the original request fingerprint even when recovering an expired signed review", async () => {
    const reviewed = plan({ expiresAt: Date.now() - 1 })
    mocks.rpc.mockResolvedValueOnce({ data: receipt, error: null }).mockResolvedValueOnce({ data: null, error: { message: "IMPORT_REQUEST_REUSED" } })
    await expect(importRoundWorkbook(roundId, actorId, requestId, signImportPlan(reviewed), reason)).rejects.toMatchObject({ message: "IMPORT_REQUEST_REUSED" })
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["admin_get_round_import", "admin_apply_round_import"])
    expect(mocks.rpc.mock.calls[1][1].p_request_hash).toBe(importDigest({ plan: reviewed, reason }))
  })

  it("queries or safely reserves an uncertain operation ID without changing it", async () => {
    await expect(getRoundImportReceiptRecord(roundId, actorId, requestId)).resolves.toEqual(receipt)
    await expect(cancelRoundImportOperation(roundId, actorId, requestId, ` ${reason} `)).resolves.toEqual(receipt)
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "admin_get_round_import", { p_request_id: requestId, p_round_id: roundId, p_actor_admin_id: actorId })
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "admin_cancel_round_import_request", { p_request_id: requestId, p_round_id: roundId, p_actor_admin_id: actorId, p_reason: reason })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it("lists safe durable history and propagates lookup errors", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [receipt], error: null }).mockResolvedValueOnce({ data: null, error: { message: "lookup failure" } })
    await expect(listRoundImportRecords(roundId, actorId)).resolves.toEqual([receipt])
    await expect(getRoundImportReceiptRecord(roundId, actorId, requestId)).rejects.toMatchObject({ message: "lookup failure" })
  })

  it("signs a fully confirmed preview but keeps an unconfirmed name suggestion uncommittable", async () => {
    const parsedRow = { rowNumber: 4, name: "张三", normalizedName: "张三", gameTypePref: "双人", rawFirstChoice: "双人本", rawSecondChoice: null, genderPref: "都可以", availability: { "2026-10-27": ["下午"] }, scriptActivityPref: null, message: null, importMetadata: { source: "temp", normalized_name: "张三", raw_first_choice: "双人本", raw_second_choice: null, script_activity_pref: null, raw_notes: null, warnings: [] } }
    mocks.context.mockResolvedValue({ state: { round_token: "round-token", member_tokens: { [memberId]: "member-token" }, identities: [], submissions: [], affected_batch_ids: ["old-batch"] }, parsedRows: [parsedRow], memberOptions: [{ id: memberId, member_number: "ZXS_1", full_name: "张三", nickname: null, temporary: false }], legacyMembers: [] })
    const buffer = Buffer.from("isolated workbook")
    const suggested = await previewRoundWorkbook(roundId, buffer, actorId)
    expect(suggested.planToken).toBeNull()
    expect(suggested.rows[0].suggestedMemberId).toBe(memberId)
    const confirmed = await previewRoundWorkbook(roundId, buffer, actorId, { 4: { target: `member:${memberId}` } })
    expect(confirmed.planToken).toBeTypeOf("string")
    const verified = verifyImportPlan(confirmed.planToken!, roundId, actorId)
    expect(verified.rows[0].existing_member_id).toBe(memberId)
    expect(confirmed.affectedBatchIds).toEqual(["old-batch"])
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
