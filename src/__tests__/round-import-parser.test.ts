import { describe, expect, it } from "vitest"
import ExcelJS from "exceljs"
import { parseRoundImportWorkbook } from "@/lib/matching/round-import-parser"

async function buildWorkbook(rows: unknown[][]) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Sheet1")
  rows.forEach((row) => sheet.addRow(row))
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
}

describe("parseRoundImportWorkbook", () => {
  it("parses google forms single-column date answers and normalizes mixed first/second choice to 都可以", async () => {
    const buffer = await buildWorkbook([
      [
        "时间戳记",
        "姓名",
        "测本类型倾向 [第一志愿（必选）]",
        "测本类型倾向 [第二志愿（选填）]",
        "匹配对象的性别倾向\n注：尽可能满足，但不一定保证匹配成功",
        "04月21日 （周二）",
        "04月22日 （周三）",
        "是否倾向选择社团提供的剧本或活动",
        "给工作人员的话&意见与建议等（选填）",
      ],
      [46131.74, "张三", "双人本", "多人本", "都可以", "全天有空", "上午有空, 晚上有空", "都可以", "备注"],
    ])

    const [row] = await parseRoundImportWorkbook(buffer, "2026-04-21", "2026-04-22")

    expect(row.gameTypePref).toBe("都可以")
    expect(row.availability["2026-04-21"]).toEqual(["上午", "下午", "晚上"])
    expect(row.availability["2026-04-22"]).toEqual(["上午", "晚上"])
  })

  it("throws when a row has no available time slots", async () => {
    const buffer = await buildWorkbook([
      [
        "时间戳记",
        "姓名",
        "测本类型倾向 [第一志愿（必选）]",
        "测本类型倾向 [第二志愿（选填）]",
        "匹配对象的性别倾向\n注：尽可能满足，但不一定保证匹配成功",
        "04月21日 （周二）",
        "是否倾向选择社团提供的剧本或活动",
        "给工作人员的话&意见与建议等（选填）",
      ],
      [46131.74, "张三", "双人本", "", "都可以", "", "都可以", ""],
    ])

    await expect(parseRoundImportWorkbook(buffer, "2026-04-21", "2026-04-21")).rejects.toThrow("至少需要一个可用时段")
  })
})
