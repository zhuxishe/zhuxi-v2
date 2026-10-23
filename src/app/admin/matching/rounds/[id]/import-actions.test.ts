import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ImportReceipt } from "@/lib/matching/round-import-contract"

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), preview: vi.fn(), commit: vi.fn(), get: vi.fn(), list: vi.fn(), cancel: vi.fn(), revalidate: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/matching/round-import-service", () => ({ previewRoundWorkbook: mocks.preview, importRoundWorkbook: mocks.commit, getRoundImportReceiptRecord: mocks.get, listRoundImportRecords: mocks.list, cancelRoundImportOperation: mocks.cancel }))
import { cancelRoundImportRequest, getRoundImportReceipt, importRoundExcel, listRoundImports, previewRoundExcel } from "./import-actions"

const roundId = "round-id", actorId = "admin-id", requestId = "10000000-0000-4000-8000-000000000003"
const reason = "根据本轮报名表追加更新成员"
const summary = { totalRows: 1, currentCount: 1, legacyCount: 0, tempCount: 0, warningCount: 0, insertedCount: 1, updatedCount: 0, unchangedCount: 0, affectedBatchIds: [] }
const receipt: ImportReceipt = { id: requestId, round_id: roundId, status: "succeeded", created_at: "2026-10-23T00:00:00Z", completed_at: "2026-10-23T00:00:01Z", reason, error_code: null, error_message: null, summary }
const review = { rows: [], memberOptions: [], legacyOptions: [], planToken: "signed-review-plan", warnings: [], affectedBatchIds: [] }
function commitForm() {
  const form = new FormData()
  form.set("requestId", requestId)
  form.set("planToken", "signed-review-plan")
  form.set("reason", ` ${reason} `)
  return form
}
function previewForm(name = "members.xlsx") {
  const form = new FormData()
  form.set("file", new File([new Uint8Array([1, 2, 3])], name))
  form.set("choices", JSON.stringify({ 4: { target: "new", gender: "other" } }))
  return form
}

describe("round Excel signed-plan server actions", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.requireAdmin.mockResolvedValue({ id: actorId, role: "super_admin" })
    mocks.preview.mockResolvedValue(review)
    mocks.commit.mockResolvedValue(receipt)
    mocks.get.mockResolvedValue(receipt)
    mocks.list.mockResolvedValue([receipt])
    mocks.cancel.mockResolvedValue(receipt)
  })

  it("parses a valid workbook preview and binds explicit row decisions to the acting super administrator", async () => {
    await expect(previewRoundExcel(roundId, previewForm())).resolves.toEqual({ success: true, review })
    const [round, buffer, actor, choices] = mocks.preview.mock.calls[0]
    expect(round).toBe(roundId)
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(actor).toBe(actorId)
    expect(choices).toEqual({ 4: { target: "new", gender: "other" } })
    expect(mocks.commit).not.toHaveBeenCalled()
  })

  it("rejects unsupported files and malformed field decisions before reading the service context", async () => {
    await expect(previewRoundExcel(roundId, previewForm("members.csv"))).resolves.toEqual({ error: "请选择 .xlsx 文件" })
    const invalid = previewForm()
    invalid.set("choices", '{"4":{"target":"new","fields":{"custom_answers":"excel"}}}')
    expect(await previewRoundExcel(roundId, invalid)).toMatchObject({ error: "字段选择无效" })
    expect(mocks.preview).not.toHaveBeenCalled()
  })

  it("rejects a workbook exceeding the deployed ingress bound before parsing", async () => {
    const form = previewForm()
    form.set("file", new File([new Uint8Array(2 * 1024 * 1024 + 1)], "oversized.xlsx"))
    await expect(previewRoundExcel(roundId, form)).resolves.toEqual({ error: "Excel 文件不能超过2MB，请拆分后分别追加导入" })
    expect(mocks.preview).not.toHaveBeenCalled()
  })

  it("bounds the complete preview response, including duplicated display values and signed plan", async () => {
    mocks.preview.mockResolvedValue({ ...review, warnings: ["a".repeat(4 * 1024 * 1024)] })
    await expect(previewRoundExcel(roundId, previewForm())).resolves.toEqual({ error: "差异预览内容过大，请拆成较小文件分别追加导入" })
  })

  it("commits only the signed plan and operation ID, rather than reparsing the file or accepting client answers", async () => {
    const form = commitForm()
    form.set("answers", '{"member_id":"attacker-replacement"}')
    form.set("file", new File(["different file"], "different.xlsx"))
    await expect(importRoundExcel(roundId, form)).resolves.toEqual({ success: true, receipt })
    expect(mocks.commit).toHaveBeenCalledExactlyOnceWith(roundId, actorId, requestId, "signed-review-plan", reason)
    expect(mocks.preview).not.toHaveBeenCalled()
    expect(mocks.revalidate).toHaveBeenCalledWith(`/admin/matching/rounds/${roundId}`)
  })

  it("returns the safe failure receipt and never labels a rolled-back import successful", async () => {
    const failed: ImportReceipt = { ...receipt, status: "failed", error_code: "IMPORT_SUBMISSION_CHANGED", error_message: "线上答卷已变化，本次未写入，请重新预览并处理差异" }
    mocks.commit.mockResolvedValue(failed)
    await expect(importRoundExcel(roundId, commitForm())).resolves.toEqual({ error: failed.error_message, receipt: failed })
  })

  it("keeps a lost response as unknown and directs the administrator to query the same operation ID", async () => {
    mocks.commit.mockRejectedValue({ message: "network transport disconnected" })
    await expect(importRoundExcel(roundId, commitForm())).resolves.toEqual({ error: "导入结果尚未确认，请查询该导入编号；请勿直接开始另一批导入" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("preserves a useful Chinese validation message without exposing raw backend errors", async () => {
    mocks.commit.mockRejectedValue(new Error("导入原因需为 4-500 个字符"))
    await expect(importRoundExcel(roundId, commitForm())).resolves.toEqual({ error: "导入原因需为 4-500 个字符" })
    mocks.get.mockRejectedValue({ message: "SQL internal stack secret" })
    await expect(getRoundImportReceipt(roundId, requestId)).resolves.toEqual({ error: "导入状态查询失败，请稍后重试" })
  })

  it("queries receipts and records, and terminates an uncertain request with the original ID", async () => {
    await expect(getRoundImportReceipt(roundId, requestId)).resolves.toEqual({ receipt })
    await expect(listRoundImports(roundId)).resolves.toEqual({ receipts: [receipt] })
    await expect(cancelRoundImportRequest(roundId, requestId, reason)).resolves.toEqual({ receipt })
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith(roundId, actorId, requestId)
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith(roundId, actorId)
    expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith(roundId, actorId, requestId, reason)
  })

  it("checks the super administrator role on all five server entry points", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "ordinary-admin", role: "admin" })
    for (const result of await Promise.all([
      previewRoundExcel(roundId, previewForm()), importRoundExcel(roundId, commitForm()),
      getRoundImportReceipt(roundId, requestId), listRoundImports(roundId), cancelRoundImportRequest(roundId, requestId, reason),
    ])) expect(result).toHaveProperty("error")
    for (const service of [mocks.preview, mocks.commit, mocks.get, mocks.list, mocks.cancel]) expect(service).not.toHaveBeenCalled()
  })
})
