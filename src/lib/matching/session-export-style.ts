import type ExcelJS from "exceljs"

const HEADER_COLOR = "FF214D3D"
const TEXT_COLOR = "FF263A30"
const STRIPE_COLOR = "FFF3F7F4"
const WHITE = "FFFFFFFF"
const FONT_SIZE = 11
const DEFAULT_COLUMN_WIDTH = 20
const MAX_ROW_HEIGHT = 409

function characterWidth(character: string): number {
  const point = character.codePointAt(0) ?? 0
  if (point === 9) return 4
  if (
    (point >= 0x0300 && point <= 0x036f)
    || point === 0x200d
    || (point >= 0xfe00 && point <= 0xfe0f)
  ) return 0
  if (
    (point >= 0x1100 && point <= 0x115f)
    || point === 0x2329 || point === 0x232a
    || (point >= 0x2e80 && point <= 0xa4cf)
    || (point >= 0xac00 && point <= 0xd7a3)
    || (point >= 0xf900 && point <= 0xfaff)
    || (point >= 0xfe10 && point <= 0xfe6f)
    || (point >= 0xff00 && point <= 0xff60)
    || (point >= 0xffe0 && point <= 0xffe6)
    || (point >= 0x1f300 && point <= 0x1faff)
    || (point >= 0x20000 && point <= 0x3fffd)
  ) return 2
  return 1
}

function textWidth(text: string): number {
  let width = 0
  for (const character of text) width += characterWidth(character)
  return width
}

function wrappedLineCount(text: string, columnWidth: number): number {
  // ExcelJS cannot measure installed fonts or auto-fit row heights. Reserve
  // padding and a small font-width allowance, then estimate Excel's word wrap.
  const capacity = Math.max(1, Math.floor((columnWidth - 2) * 0.9))
  let total = 0
  for (const paragraph of text.split(/\r\n|\r|\n/)) {
    let lines = 1
    let available = capacity
    for (const token of paragraph.split(/(\s+)/)) {
      const width = textWidth(token)
      if (width === 0) continue
      if (/^\s+$/.test(token)) {
        available = Math.max(0, available - width)
      } else if (width <= available) {
        available -= width
      } else {
        if (available < capacity) lines += 1
        lines += Math.ceil(width / capacity) - 1
        available = capacity - (width % capacity || capacity)
      }
    }
    total += lines
  }
  return total
}

function isNumericCell(cell: ExcelJS.Cell): boolean {
  const value = cell.value
  return typeof value === "number" || (
    value !== null && typeof value === "object"
    && "result" in value && typeof value.result === "number"
  )
}

function columnName(columnNumber: number): string {
  let name = ""
  for (let remaining = columnNumber; remaining > 0; remaining = Math.floor((remaining - 1) / 26)) {
    name = String.fromCharCode(65 + (remaining - 1) % 26) + name
  }
  return name
}

function normalizedTabColor(color?: string): string {
  const hex = color?.replace(/^#/, "")
  if (hex && /^[0-9a-f]{6}$/i.test(hex)) return `FF${hex.toUpperCase()}`
  if (hex && /^[0-9a-f]{8}$/i.test(hex)) return hex.toUpperCase()
  return HEADER_COLOR
}

/** Apply presentation only; headers, cell values, number formats and types stay intact. */
export function styleSessionExportSheet(
  sheet: ExcelJS.Worksheet,
  columnWidths: readonly number[],
  options?: { freezeColumns?: number; tabColor?: string },
): void {
  const columnCount = sheet.columnCount
  const rowCount = sheet.rowCount
  if (columnCount === 0 || rowCount === 0) return

  // Only style existing columns, even if a caller supplies extra width entries.
  const widths = Array.from({ length: columnCount }, (_, index) => {
    const column = sheet.getColumn(index + 1)
    const requested = columnWidths[index] ?? column.width ?? DEFAULT_COLUMN_WIDTH
    const width = Number.isFinite(requested)
      ? Math.min(80, Math.max(8, requested))
      : DEFAULT_COLUMN_WIDTH
    column.width = width
    return width
  })
  const requestedFreeze = options?.freezeColumns ?? 0
  const freezeColumns = Number.isFinite(requestedFreeze)
    ? Math.min(columnCount, Math.max(0, Math.floor(requestedFreeze)))
    : 0

  sheet.properties.tabColor = { argb: normalizedTabColor(options?.tabColor) }
  sheet.properties.defaultRowHeight = 24
  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: freezeColumns, showGridLines: false }]
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: rowCount, column: columnCount },
  }
  sheet.pageSetup = {
    ...sheet.pageSetup,
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: "1:1",
    printArea: `A1:${columnName(columnCount)}${rowCount}`,
    showGridLines: false,
    margins: { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
  }

  sheet.eachRow((row, rowNumber) => {
    const isHeader = rowNumber === 1
    let lines = 1
    for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
      const cell = row.getCell(columnNumber)
      cell.font = { name: "Calibri", size: FONT_SIZE, bold: isHeader, color: { argb: isHeader ? WHITE : TEXT_COLOR } }
      cell.alignment = {
        horizontal: !isHeader && isNumericCell(cell) ? "right" : "left",
        vertical: isHeader ? "middle" : "top",
        wrapText: true,
        ...(!isHeader && isNumericCell(cell) ? { indent: 1 } : {}),
      }
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isHeader ? HEADER_COLOR : rowNumber % 2 === 0 ? WHITE : STRIPE_COLOR },
      }
      cell.border = isHeader ? { bottom: { style: "thin", color: { argb: HEADER_COLOR } } } : {}
      lines = Math.max(lines, wrappedLineCount(cell.text, widths[columnNumber - 1]))
    }
    // One height is shared across the entire row, including paired multiline
    // name/number cells. The Excel limit affects display only: never trim data.
    const estimatedHeight = Math.max(isHeader ? 32 : 24, lines * (isHeader ? 17 : 16.5) + 8)
    row.height = Math.min(MAX_ROW_HEIGHT, Math.max(row.height ?? 0, estimatedHeight))
  })
}
