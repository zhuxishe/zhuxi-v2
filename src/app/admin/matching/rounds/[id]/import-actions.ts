"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { previewRoundWorkbook, importRoundWorkbook, getRoundImportReceiptRecord, listRoundImportRecords, cancelRoundImportOperation } from "@/lib/matching/round-import-service"
import { parseImportChoices } from "@/lib/matching/round-import-plan"
import { getPostgrestErrorMessage } from "@/lib/supabase/postgrest-error"

function message(error: unknown, fallback: string) {
  const value = getPostgrestErrorMessage(error, fallback)
  return /[\u3400-\u9fff]/.test(value) ? value : fallback
}
function field(form: FormData, key: string) {
  const value = form.get(key)
  return typeof value === "string" ? value : ""
}
export async function previewRoundExcel(roundId: string, formData: FormData) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可以预览成员导入文件" }
  try {
    const file = formData.get("file")
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) throw new Error("请选择 .xlsx 文件")
    if (file.size > 2 * 1024 * 1024) throw new Error("Excel 文件不能超过2MB，请拆分后分别追加导入")
    const review = await previewRoundWorkbook(roundId, Buffer.from(await file.arrayBuffer()), admin.id, parseImportChoices(formData.get("choices")))
    if (Buffer.byteLength(JSON.stringify(review), "utf8") > 3.5 * 1024 * 1024) throw new Error("差异预览内容过大，请拆成较小文件分别追加导入")
    return { success: true, review }
  } catch (error) { return { error: message(error, "Excel 解析失败，请检查文件和本轮状态后重试") } }
}
export async function importRoundExcel(roundId: string, formData: FormData) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可以执行成员批量导入" }
  try {
    const receipt = await importRoundWorkbook(roundId, admin.id, field(formData, "requestId"), field(formData, "planToken"), field(formData, "reason").trim())
    revalidatePath(`/admin/matching/rounds/${roundId}`)
    if (receipt.status === "failed") return { error: receipt.error_message ?? "本次导入未写入，请重新预览后重试", receipt }
    return { success: true, receipt }
  } catch (error) { return { error: message(error, "导入结果尚未确认，请查询该导入编号；请勿直接开始另一批导入") } }
}
export async function getRoundImportReceipt(roundId: string, requestId: string) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可以查询导入回执" }
  try { return { receipt: await getRoundImportReceiptRecord(roundId, admin.id, requestId) } }
  catch (error) { return { error: message(error, "导入状态查询失败，请稍后重试") } }
}
export async function listRoundImports(roundId: string) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可以查询导入记录" }
  try { return { receipts: await listRoundImportRecords(roundId, admin.id) } }
  catch (error) { return { error: message(error, "导入记录查询失败") } }
}
export async function cancelRoundImportRequest(roundId: string, requestId: string, reason: string) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可以处理导入编号" }
  try {
    const receipt = await cancelRoundImportOperation(roundId, admin.id, requestId, reason)
    revalidatePath(`/admin/matching/rounds/${roundId}`)
    return { receipt }
  } catch (error) { return { error: message(error, "无法终止该编号，请先查询导入状态") } }
}
