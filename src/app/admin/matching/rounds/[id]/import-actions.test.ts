import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  previewRoundWorkbook: vi.fn(),
  importRoundWorkbook: vi.fn(),
  createServerClient: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/matching/round-import-preview", () => ({
  previewRoundWorkbook: mocks.previewRoundWorkbook,
}))
vi.mock("@/lib/matching/round-import-service", () => ({
  importRoundWorkbook: mocks.importRoundWorkbook,
}))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createServerClient }))

import { importRoundExcel } from "./import-actions"

const summary = {
  totalRows: 1,
  currentCount: 0,
  legacyCount: 0,
  tempCount: 1,
  warningCount: 0,
}

function importForm(reason: string) {
  const formData = new FormData()
  formData.set("file", new File([new Uint8Array([1, 2, 3])], "members.xlsx"))
  formData.set("reason", reason)
  formData.set("legacyOverrides", "{}")
  formData.set("genderOverrides", JSON.stringify({ 2: "other" }))
  return formData
}

function auditRequest() {
  return {
    memberId: "member-id",
    operation: "create" as const,
    reason: "根据本轮报名表重新导入成员",
    metadata: {
      event_scope: "round_excel_member_import" as const,
      round: { id: "round-id" },
      file: { sha256: "a".repeat(64), size_bytes: 3, extension: "xlsx" as const },
      row: { number: 2 },
      phase: "apply" as const,
      write_stage: "after_service_write" as const,
      service_write_performed: true,
      atomic_with_service_write: false as const,
    },
  }
}

describe("round Excel import server action", () => {
  const rpc = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ role: "super_admin" })
    mocks.createServerClient.mockResolvedValue({ rpc })
    rpc.mockResolvedValue({ data: { recorded: true }, error: null })
    mocks.importRoundWorkbook.mockResolvedValue({ rows: [], summary })
  })

  it("requires a 4-500 character human reason before creating an import client", async () => {
    const result = await importRoundExcel("round-id", importForm("短因"))

    expect(result).toEqual({ error: "导入原因需为 4-500 个字符" })
    expect(mocks.createServerClient).not.toHaveBeenCalled()
    expect(mocks.importRoundWorkbook).not.toHaveBeenCalled()
  })

  it("passes a content fingerprint and an authenticated audit recorder to the service import", async () => {
    const result = await importRoundExcel(
      "round-id",
      importForm("  根据本轮报名表重新导入成员  "),
    )

    expect(result).toEqual({ success: true, summary })
    expect(mocks.createServerClient).toHaveBeenCalledTimes(1)
    const [roundId, buffer, audit, legacyOverrides, genderOverrides] = mocks.importRoundWorkbook.mock.calls[0]
    expect(roundId).toBe("round-id")
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(audit.reason).toBe("根据本轮报名表重新导入成员")
    expect(audit.file).toMatchObject({ sizeBytes: 3, extension: "xlsx" })
    expect(audit.file.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(audit.file).not.toHaveProperty("name")
    expect(legacyOverrides).toEqual({})
    expect(genderOverrides).toEqual({ 2: "other" })

    await audit.recordEvent(auditRequest())
    expect(rpc).toHaveBeenCalledWith("admin_record_member_import_event", {
      p_member_id: "member-id",
      p_operation: "create",
      p_reason: "根据本轮报名表重新导入成员",
      p_metadata: auditRequest().metadata,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/matching/rounds/round-id")
  })

  it("surfaces an authenticated audit RPC failure and does not report import success", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "audit RPC unavailable" } })
    mocks.importRoundWorkbook.mockImplementation(async (_roundId, _buffer, audit) => {
      await audit.recordEvent(auditRequest())
      return { rows: [], summary }
    })

    const result = await importRoundExcel("round-id", importForm("根据本轮报名表重新导入成员"))

    expect(result).toEqual({ error: "audit RPC unavailable" })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("rejects ordinary administrators before parsing or mutating the workbook", async () => {
    mocks.requireAdmin.mockResolvedValue({ role: "admin" })

    const result = await importRoundExcel("round-id", importForm("根据本轮报名表重新导入成员"))

    expect(result).toEqual({ error: "仅超级管理员可以执行成员批量导入" })
    expect(mocks.createServerClient).not.toHaveBeenCalled()
    expect(mocks.importRoundWorkbook).not.toHaveBeenCalled()
  })
})

describe("round import reason UI contract", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/admin/RoundImportPanel.tsx"),
    "utf8",
  )

  it("requires and submits the same bounded reason used by the server action", () => {
    expect(source).toContain('formData.set("reason", importReason.trim())')
    expect(source).toContain("minLength={4}")
    expect(source).toContain("maxLength={500}")
    expect(source).toContain("required")
    expect(source).toContain("|| !reasonIsValid")
  })
})
