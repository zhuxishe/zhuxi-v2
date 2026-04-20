import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import { parseRoundImportWorkbook } from "@/lib/matching/round-import-parser"

function buildWorkbook(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1")
  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" })
}

describe("parseRoundImportWorkbook", () => {
  it("expands 全天 and normalizes mixed first/second choice to 都可以", () => {
    const buffer = buildWorkbook([
      [
        "姓名",
        "第一志愿",
        "第二志愿",
        "匹配对象的性别倾向",
        "04月21日（周二） 全天",
        "04月22日（周三） 上午有空",
        "是否倾向选择社团提供的剧本或活动",
        "给工作人员的话",
      ],
      ["张三", "双人本", "多人本", "都可以", true, true, "都可以", "备注"],
    ])

    const [row] = parseRoundImportWorkbook(buffer, "2026-04-21", "2026-04-22")

    expect(row.gameTypePref).toBe("都可以")
    expect(row.availability["2026-04-21"]).toEqual(["上午", "下午", "晚上"])
    expect(row.availability["2026-04-22"]).toEqual(["上午"])
  })

  it("throws when a row has no available time slots", () => {
    const buffer = buildWorkbook([
      [
        "姓名", "第一志愿", "第二志愿", "匹配对象的性别倾向",
        "04月21日（周二） 上午有空", "是否倾向选择社团提供的剧本或活动", "给工作人员的话",
      ],
      ["张三", "双人本", "", "都可以", "", "都可以", ""],
    ])

    expect(() => parseRoundImportWorkbook(buffer, "2026-04-21", "2026-04-21")).toThrow("至少需要一个可用时段")
  })
})
