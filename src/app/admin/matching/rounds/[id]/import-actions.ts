"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { previewRoundWorkbook } from "@/lib/matching/round-import-preview"
import { importRoundWorkbook } from "@/lib/matching/round-import-service"
import { getPostgrestErrorMessage } from "@/lib/supabase/postgrest-error"
import type { LegacyOverrideMap } from "@/lib/matching/round-import-types"

function readExcelFile(formData: FormData) {
  const file = formData.get("file")
  if (!(file instanceof File)) throw new Error("请选择 Excel 文件")
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("目前只支持 .xlsx 文件")
  return file
}

function parseOverrides(formData: FormData): LegacyOverrideMap {
  const raw = formData.get("legacyOverrides")
  if (typeof raw !== "string" || !raw.trim()) return {}
  try {
    return JSON.parse(raw) as LegacyOverrideMap
  } catch {
    throw new Error("老成员手动匹配配置无效")
  }
}

export async function previewRoundExcel(roundId: string, formData: FormData) {
  await requireAdmin()

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
  await requireAdmin()

  try {
    const file = readExcelFile(formData)
    const overrides = parseOverrides(formData)
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await importRoundWorkbook(roundId, buffer, overrides)
    revalidatePath(`/admin/matching/rounds/${roundId}`)
    return { success: true, summary: result.summary }
  } catch (error) {
    const message = getPostgrestErrorMessage(error, "导入失败")
    return { error: message }
  }
}
