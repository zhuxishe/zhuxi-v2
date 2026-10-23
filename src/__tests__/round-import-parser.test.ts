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

  it("preserves blank fields for the append/update review to keep existing answers", async () => {
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

    const [row] = await parseRoundImportWorkbook(buffer, "2026-04-21", "2026-04-21")

    expect(row.availability).toEqual({})
    expect(row.blankFields).toEqual(expect.arrayContaining(["availability", "message"]))
    expect(row.blankFields).not.toContain("game_type_pref")
    expect(row.blankFields).not.toContain("gender_pref")
  })

  it("keeps the physical worksheet row number after a blank row", async () => {
    const buffer = await buildWorkbook([
      ["姓名", "第一志愿", "第二志愿", "匹配对象的性别倾向", "04月21日", "是否倾向选择社团提供的剧本或活动", "给工作人员的话"],
      ["张三", "双人本", "多人本", "都可以", "下午", "都可以", "第一人"],
      [],
      ["李四", "多人本", "", "女", "晚上", "", "第二人"],
    ])

    const rows = await parseRoundImportWorkbook(buffer, "2026-04-21", "2026-04-21")

    expect(rows.map(({ rowNumber, name }) => [rowNumber, name])).toEqual([[2, "张三"], [4, "李四"]])
  })

  it("distinguishes blank values from invalid nonblank choices", async () => {
    const headers = ["姓名", "第一志愿", "第二志愿", "匹配对象的性别倾向", "04月21日", "是否倾向选择社团提供的剧本或活动", "给工作人员的话"]
    const blank = await buildWorkbook([headers, ["张三", "", "", "", "", "", ""]])
    const [row] = await parseRoundImportWorkbook(blank, "2026-04-21", "2026-04-21")

    expect(row.blankFields).toEqual(expect.arrayContaining([
      "game_type_pref", "gender_pref", "availability", "script_activity_pref", "message",
    ]))

    const invalidGender = await buildWorkbook([headers, ["张三", "双人本", "", "无法识别的倾向", "下午", "", ""]])
    await expect(parseRoundImportWorkbook(invalidGender, "2026-04-21", "2026-04-21")).rejects.toThrow("性别倾向无法识别")
    const invalidSecondChoice = await buildWorkbook([headers, ["张三", "双人本", "无效第二志愿", "都可以", "下午", "", ""]])
    await expect(parseRoundImportWorkbook(invalidSecondChoice, "2026-04-21", "2026-04-21")).rejects.toThrow("第二志愿无法识别")
  })

  it("does not read October 10 as October 1 when slash date columns are reordered", async () => {
    const buffer = await buildWorkbook([
      ["姓名", "第一志愿", "第二志愿", "匹配对象的性别倾向", "可用时间 10/10（周六）", "可用时间 10/1（周四）", "是否倾向选择社团提供的剧本或活动", "给工作人员的话"],
      ["张三", "双人本", "", "都可以", "晚上", "上午", "", ""],
    ])
    const [row] = await parseRoundImportWorkbook(buffer, "2026-10-01", "2026-10-01")
    expect(row.availability).toEqual({ "2026-10-01": ["上午"] })
  })

  it("does not read November as January inside a longer numeric month", async () => {
    const buffer = await buildWorkbook([
      ["姓名", "第一志愿", "第二志愿", "匹配对象的性别倾向", "11月1日（周日）", "1月1日（周四）", "是否倾向选择社团提供的剧本或活动", "给工作人员的话"],
      ["张三", "双人本", "", "都可以", "晚上", "上午", "", ""],
    ])
    const [row] = await parseRoundImportWorkbook(buffer, "2026-01-01", "2026-01-01")
    expect(row.availability).toEqual({ "2026-01-01": ["上午"] })
  })

  it("accepts surrounding question text and rejects duplicate columns for the same date", async () => {
    const headers = ["姓名", "第一志愿", "第二志愿", "匹配对象的性别倾向", "可用时间（2026-10-01，周四）", "是否倾向选择社团提供的剧本或活动", "给工作人员的话"]
    const valid = await buildWorkbook([headers, ["张三", "双人本", "", "都可以", "下午", "", ""]])
    expect((await parseRoundImportWorkbook(valid, "2026-10-01", "2026-10-01"))[0].availability).toEqual({ "2026-10-01": ["下午"] })
    const repeated = await buildWorkbook([[...headers, "10/1（再次填写）"], ["张三", "双人本", "", "都可以", "下午", "", "", "上午"]])
    await expect(parseRoundImportWorkbook(repeated, "2026-10-01", "2026-10-01")).rejects.toThrow("日期列重复：2026-10-01")
  })
})
