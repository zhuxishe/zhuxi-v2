import ExcelJS from "exceljs"
import type { Availability } from "./types"
import type { ParsedImportRow } from "./round-import-types"
import { normalizeGameTypeChoice, normalizeGenderPref, normalizeImportName } from "./round-import-utils"

function normalizeHeader(value: unknown): string {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, "")
}

function buildDateHeaders(start: string, end: string): Array<{ date: string; labels: string[] }> {
  const dates: Array<{ date: string; labels: string[] }> = []
  const cursor = new Date(start)
  const last = new Date(end)
  while (cursor <= last) {
    const date = cursor.toISOString().slice(0, 10)
    const month = cursor.getMonth() + 1
    const day = cursor.getDate()
    dates.push({
      date,
      labels: [
        `${String(month).padStart(2, "0")}月${String(day).padStart(2, "0")}日`,
        `${month}月${day}日`,
        `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`,
        `${month}/${day}`,
        date,
      ],
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

function findSingleColumn(headers: string[], label: string): number {
  const index = headers.findIndex((header) => header.includes(label))
  if (index === -1) throw new Error(`未找到列：${label}`)
  return index
}

function findDateColumns(headers: string[], start: string, end: string) {
  return buildDateHeaders(start, end).map(({ date, labels }) => {
    const index = headers.findIndex((header) =>
      labels.some((label) => header.includes(label))
    )
    if (index === -1) throw new Error(`未找到日期列：${date}`)
    return { date, index }
  })
}

function parseDailySlots(value: unknown): string[] {
  const text = String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .trim()
  if (!text) return []

  const slots = new Set<string>()
  if (text.includes("全天有空") || text.includes("全天")) {
    slots.add("上午")
    slots.add("下午")
    slots.add("晚上")
  }
  if (text.includes("上午有空") || text.includes("上午")) slots.add("上午")
  if (text.includes("下午有空") || text.includes("下午")) slots.add("下午")
  if (text.includes("晚上有空") || text.includes("晚上")) slots.add("晚上")
  return Array.from(slots)
}

function buildAvailability(row: unknown[], dateColumns: Array<{ date: string; index: number }>): Availability {
  const availability: Availability = {}
  for (const { date, index } of dateColumns) {
    const slots = parseDailySlots(row[index])
    if (slots.length > 0) availability[date] = slots
  }
  return availability
}

function normalizeCellValue(value: ExcelJS.CellValue | undefined): unknown {
  if (value == null) return ""
  if (value instanceof Date) return value
  if (typeof value !== "object") return value
  if ("result" in value) return value.result ?? ""
  if ("text" in value) return value.text ?? ""
  if ("richText" in value) return value.richText.map((part) => part.text).join("")
  if ("hyperlink" in value) {
    const hyperlinkValue = value as { text?: string; hyperlink?: string }
    return hyperlinkValue.text ?? hyperlinkValue.hyperlink ?? ""
  }
  return ""
}

async function readMatrix(buffer: Buffer): Promise<unknown[][]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as any)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error("Excel 文件为空")

  const width = Math.max(sheet.columnCount, sheet.actualColumnCount, 1)
  return Array.from({ length: sheet.rowCount }, (_, rowIndex) => {
    const row = sheet.getRow(rowIndex + 1)
    return Array.from({ length: width }, (_, colIndex) =>
      normalizeCellValue(row.getCell(colIndex + 1).value)
    )
  })
}

export async function parseRoundImportWorkbook(
  buffer: Buffer,
  activityStart: string,
  activityEnd: string,
): Promise<ParsedImportRow[]> {
  const matrix = await readMatrix(buffer)
  if (matrix.length < 2) throw new Error("Excel 文件没有可导入的数据")

  const headers = (matrix[0] ?? []).map(normalizeHeader)
  const nameIndex = findSingleColumn(headers, "姓名")
  const firstChoiceIndex = findSingleColumn(headers, "第一志愿")
  const secondChoiceIndex = findSingleColumn(headers, "第二志愿")
  const genderIndex = findSingleColumn(headers, "匹配对象的性别倾向")
  const scriptIndex = findSingleColumn(headers, "是否倾向选择社团提供的剧本或活动")
  const messageIndex = findSingleColumn(headers, "给工作人员的话")
  const dateColumns = findDateColumns(headers, activityStart, activityEnd)

  return matrix.slice(1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row, index) => {
      const rowNumber = index + 2
      const name = String(row[nameIndex] ?? "").trim()
      if (!name) throw new Error(`第 ${rowNumber} 行：姓名不能为空`)

      const rawFirstChoice = String(row[firstChoiceIndex] ?? "").trim()
      const rawSecondChoice = String(row[secondChoiceIndex] ?? "").trim() || null
      const firstChoice = normalizeGameTypeChoice(rawFirstChoice)
      const secondChoice = normalizeGameTypeChoice(rawSecondChoice)
      if (!firstChoice) throw new Error(`第 ${rowNumber} 行：第一志愿不能为空`)
      if (rawSecondChoice && !secondChoice) throw new Error(`第 ${rowNumber} 行：第二志愿无法识别`)

      const genderPref = normalizeGenderPref(String(row[genderIndex] ?? "").trim())
      if (!genderPref) throw new Error(`第 ${rowNumber} 行：性别倾向无法识别`)

      const availability = buildAvailability(row, dateColumns)
      if (Object.keys(availability).length === 0) {
        throw new Error(`第 ${rowNumber} 行：至少需要一个可用时段`)
      }

      return {
        rowNumber,
        name,
        normalizedName: normalizeImportName(name),
        gameTypePref: !rawSecondChoice || firstChoice === secondChoice ? firstChoice : "都可以",
        rawFirstChoice,
        rawSecondChoice,
        genderPref,
        availability,
        scriptActivityPref: String(row[scriptIndex] ?? "").trim() || null,
        message: String(row[messageIndex] ?? "").trim() || null,
        importMetadata: {
          source: "temp",
          normalized_name: normalizeImportName(name),
          raw_first_choice: rawFirstChoice,
          raw_second_choice: rawSecondChoice,
          script_activity_pref: String(row[scriptIndex] ?? "").trim() || null,
          raw_notes: String(row[messageIndex] ?? "").trim() || null,
          warnings: [],
        },
      }
    })
}
