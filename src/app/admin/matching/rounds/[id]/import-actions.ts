"use server"

import { createHash } from "node:crypto"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { previewRoundWorkbook } from "@/lib/matching/round-import-preview"
import { importRoundWorkbook } from "@/lib/matching/round-import-service"
import type { RoundImportAuditRequest } from "@/lib/matching/round-import-service"
import { getPostgrestErrorMessage } from "@/lib/supabase/postgrest-error"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { isManualSelfGender } from "@/lib/matching/round-import-utils"
import type { GenderOverrideMap, LegacyOverrideMap } from "@/lib/matching/round-import-types"

interface ImportAuditRpcClient {
  rpc: (
    functionName: "admin_record_member_import_event",
    args: {
      p_member_id: string
      p_operation: RoundImportAuditRequest["operation"]
      p_reason: string
      p_metadata: RoundImportAuditRequest["metadata"]
    },
  ) => Promise<{ error: unknown }>
}

function readExcelFile(formData: FormData) {
  const file = formData.get("file")
  if (!(file instanceof File)) throw new Error("请选择 Excel 文件")
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("目前只支持 .xlsx 文件")
  return file
}

function parseJsonRecord(formData: FormData, key: string, label: string) {
  const raw = formData.get(key)
  if (typeof raw !== "string" || !raw.trim()) return {}
  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    throw new Error(`${label}配置无效`)
  }
}

function parseLegacyOverrides(formData: FormData): LegacyOverrideMap {
  return parseJsonRecord(formData, "legacyOverrides", "老成员手动匹配") as LegacyOverrideMap
}

function parseGenderOverrides(formData: FormData): GenderOverrideMap {
  const raw = parseJsonRecord(formData, "genderOverrides", "本人性别")
  const result: GenderOverrideMap = {}
  for (const [rowNumber, value] of Object.entries(raw)) {
    if (!isManualSelfGender(value)) throw new Error("本人性别配置无效")
    result[rowNumber] = value
  }
  return result
}

function readImportReason(formData: FormData) {
  const raw = formData.get("reason")
  const reason = typeof raw === "string" ? raw.trim() : ""
  const length = Array.from(reason).length
  if (length < 4 || length > 500) throw new Error("导入原因需为 4-500 个字符")
  return reason
}

export async function previewRoundExcel(roundId: string, formData: FormData) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可以预览含原始会员编号的导入文件" }

  try {
    const file = readExcelFile(formData)
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await previewRoundWorkbook(roundId, buffer)
    return { success: true, rows: result.rows, legacyOptions: result.legacyOptions }
  } catch (error) {
    const message = getPostgrestErrorMessage(error, "解析失败")
    return { error: message }
  }
}

export async function importRoundExcel(roundId: string, formData: FormData) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可以执行成员批量导入" }

  try {
    const file = readExcelFile(formData)
    const reason = readImportReason(formData)
    const legacyOverrides = parseLegacyOverrides(formData)
    const genderOverrides = parseGenderOverrides(formData)
    const buffer = Buffer.from(await file.arrayBuffer())
    const sessionDb = await createServerClient() as unknown as ImportAuditRpcClient
    const result = await importRoundWorkbook(
      roundId,
      buffer,
      {
        reason,
        file: {
          sha256: createHash("sha256").update(buffer).digest("hex"),
          sizeBytes: buffer.byteLength,
          extension: "xlsx",
        },
        recordEvent: async (request) => {
          const { error } = await sessionDb.rpc("admin_record_member_import_event", {
            p_member_id: request.memberId,
            p_operation: request.operation,
            p_reason: request.reason,
            p_metadata: request.metadata,
          })
          if (error) throw error
        },
      },
      legacyOverrides,
      genderOverrides,
    )
    revalidatePath(`/admin/matching/rounds/${roundId}`)
    return { success: true, summary: result.summary }
  } catch (error) {
    const message = getPostgrestErrorMessage(error, "导入失败")
    return { error: message }
  }
}
