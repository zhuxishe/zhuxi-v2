"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { importRoundWorkbook } from "@/lib/matching/round-import-service"

export async function importRoundExcel(roundId: string, formData: FormData) {
  await requireAdmin()

  const file = formData.get("file")
  if (!(file instanceof File)) return { error: "请选择 Excel 文件" }
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { error: "目前只支持 .xlsx 文件" }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await importRoundWorkbook(roundId, buffer)
    revalidatePath(`/admin/matching/rounds/${roundId}`)
    return { success: true, summary: result.summary }
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入失败"
    return { error: message }
  }
}
