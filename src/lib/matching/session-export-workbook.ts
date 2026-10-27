import ExcelJS from "exceljs"
import { calendarWeekday } from "../calendar-date"
import { getBoardTimeOptions } from "./board-time-options"
import { getImportMetadata } from "./import-metadata"
import { sessionSubmissionInputLabel, type MatchingInputSnapshot } from "./input-snapshot-reader"
import { unmatchedDiagnosticMessages } from "./unmatched-diagnostic-display"
import { styleSessionExportSheet } from "./session-export-style"

type Row = Record<string, any>
type Cell = string | number | null
export interface SessionExportData {
  results: Row[]
  diagnostics: Row[]
  members: Row[]
  submissions: Row[]
  snapshot: MatchingInputSnapshot | null
}

export function exportMemberIds(row: Row): string[] {
  return Array.isArray(row.group_members) && row.group_members.length > 0
    ? row.group_members : [row.member_a_id, row.member_b_id].filter(Boolean)
}

export function exportCohortIds(results: Row[], diagnostics: Row[], snapshot: MatchingInputSnapshot | null): string[] {
  return [...new Set([
    ...(snapshot?.engine_input.candidates.map((row) => row.submissionId) ?? []),
    ...results.flatMap(exportMemberIds), ...diagnostics.map((row) => row.member_id),
  ])]
}

const text = (value: unknown): string => typeof value === "string" ? value.trim() : ""
const preference = (value: unknown) => value === "男" ? "偏向男生" : value === "女" ? "偏向女生" : value === "都可以" ? "不限" : "未填写"
const gameType = (value: unknown) => value === "双人" ? "双人本" : value === "多人" ? "多人本" : value === "都可以" ? "都可以" : "未填写"
const dateLabel = (date: string) => `${date}（周${"日一二三四五六"[calendarWeekday(date)]}）`

function slotText(value: unknown) {
  const match = typeof value === "string" && /^(\d{4}-\d{2}-\d{2})[ _](上午|下午|晚上)$/.exec(value)
  return match && Number.isFinite(calendarWeekday(match[1])) ? `${dateLabel(match[1])} ${match[2]}` : text(value) || "未指定"
}

function commonTimes(ids: string[], submissions: Record<string, Row>): string {
  // Use the intersection of every member, never a union of pairwise overlaps.
  const options = getBoardTimeOptions(ids, submissions, null)
  if (!options.complete) return "资料不足，无法计算"
  if (!options.commonSlots.length) return "无共同可用时间段"
  const days = new Map<string, string[]>()
  for (const slot of options.commonSlots) {
    const [date, period] = slot.split("_")
    days.set(date, [...(days.get(date) ?? []), period])
  }
  return [...days].map(([date, periods]) => `${dateLabel(date)} ${periods.join("、")}`).join("\n")
}

function genderSummary(ids: string[], submissions: Record<string, Row>) {
  const count = { 男: 0, 女: 0, 都可以: 0, 未填写: 0 }
  for (const id of ids) {
    const value: unknown = submissions[id]?.gender_pref
    if (value === "男" || value === "女" || value === "都可以") count[value]++
    else count.未填写++
  }
  return `偏向男生 ${count.男} 人／偏向女生 ${count.女} 人／不限 ${count.都可以} 人${count.未填写 ? `／未填写 ${count.未填写} 人` : ""}`
}

function diagnosticText(row: Row | undefined, cancelled: boolean) {
  if (!row) return cancelled ? "原配对已取消，待重新安排" : "本次方案中未安排"
  if (row.details?.stage === "manual_board") return "人工调整后暂未安排"
  const messages = unmatchedDiagnosticMessages(row.details)
  if (messages[0].startsWith("历史记录") && /[\u3400-\u9fff]/.test(text(row.reason))) return text(row.reason)
  return messages.join("\n")
}

function addSheet(book: ExcelJS.Workbook, name: string, headers: string[], rows: Cell[][], widths: number[], freezeColumns = 1) {
  const sheet = book.addWorksheet(name)
  sheet.addRow(headers)
  // String cells remain literal text, including strings beginning with =, + or @.
  for (const row of rows) sheet.addRow(row)
  styleSessionExportSheet(sheet, widths, { freezeColumns })
  const scoreColumn = headers.indexOf("total_score") + 1
  if (scoreColumn > 0) sheet.getColumn(scoreColumn).numFmt = "0.##"
}

/** Pure presentation builder. It neither changes results nor publishes/notifies. */
export function createSessionExportWorkbook(data: SessionExportData): ExcelJS.Workbook {
  const { results, diagnostics, snapshot } = data
  const submissions = Object.fromEntries(data.submissions.map((row) => [row.member_id, row]))
  const members = new Map(data.members.map((row) => {
    const identity = Array.isArray(row.member_identity) ? row.member_identity[0] : row.member_identity
    return [row.id, { name: text(identity?.full_name) || text(identity?.nickname) || "姓名未提供", number: text(row.member_number) || "未分配编号" }]
  }))
  const nameOf = (id: string) => members.get(id)?.name ?? "姓名未提供"
  const numberOf = (id: string) => members.get(id)?.number ?? "未分配编号"
  const noteOf = (id: string) => text(submissions[id]?.message) || text(getImportMetadata(submissions[id]?.import_metadata)?.raw_notes)
  const capturedAt = snapshot?.captured_at ?? ""
  const active = results.filter((row) => row.status !== "cancelled")
  const matched = new Set<string>()
  for (const row of active) {
    const ids = exportMemberIds(row)
    const multi = Array.isArray(row.group_members) && row.group_members.length > 0
    if ((multi && ids.length < 3) || (!multi && ids.length !== 2)) throw new Error("匹配结果人数不完整，请先核对并保存方案后再导出")
    for (const id of ids) {
      if (matched.has(id)) throw new Error("匹配结果中存在重复玩家，请先核对方案后再导出")
      matched.add(id)
    }
  }
  const duoRows: Cell[][] = [], multiRows: Cell[][] = [], publicationRows: Cell[][] = []
  let duoNumber = 0, multiNumber = 0
  // The publication summary follows the same sheet order as the detailed views.
  const ordered = [...active.filter((row) => !row.group_members?.length), ...active.filter((row) => row.group_members?.length)]
  for (const row of ordered) {
    const ids = exportMemberIds(row), multi = !!row.group_members?.length
    const type = multi ? "多人本" : "双人本"
    const group = multi ? `多人 ${++multiNumber}` : `双人 ${++duoNumber}`
    const names = ids.map(nameOf).join("\n"), numbers = ids.map(numberOf).join("\n")
    const times = commonTimes(ids, submissions), best = slotText(row.best_slot)
    const notes = ids.flatMap((id) => noteOf(id) ? [`${nameOf(id)}：${noteOf(id)}`] : []).join("\n")
    const source = ids.some((id) => sessionSubmissionInputLabel(snapshot, id) === "后续人工调整当前资料")
      ? "含后续人工调整当前资料" : sessionSubmissionInputLabel(snapshot, ids[0])
    const score = typeof row.total_score === "number" ? row.total_score : null
    if (multi) {
      multiRows.push([names, numbers, type, genderSummary(ids, submissions), best, times, score, notes, source, capturedAt])
    } else {
      duoRows.push([nameOf(ids[0]), numberOf(ids[0]), preference(submissions[ids[0]]?.gender_pref),
        nameOf(ids[1]), numberOf(ids[1]), preference(submissions[ids[1]]?.gender_pref),
        type, genderSummary(ids, submissions), best, times, score, notes, source, capturedAt])
    }
    publicationRows.push([group, type, ids.length, names, numbers, best, times])
  }
  const diagnosticMap = new Map(diagnostics.map((row) => [row.member_id, row]))
  const cancelled = new Set(results.filter((row) => row.status === "cancelled").flatMap(exportMemberIds))
  const unmatchedRows = exportCohortIds(results, diagnostics, snapshot).filter((id) => !matched.has(id))
    .sort((a, b) => numberOf(a).localeCompare(numberOf(b), "zh-CN", { numeric: true }) || nameOf(a).localeCompare(nameOf(b), "zh-CN"))
    .map((id): Cell[] => [nameOf(id), numberOf(id), gameType(submissions[id]?.game_type_pref), preference(submissions[id]?.gender_pref),
      [`未匹配原因：${diagnosticText(diagnosticMap.get(id), cancelled.has(id))}`, ...(noteOf(id) ? [`报名留言：${noteOf(id)}`] : [])].join("\n"),
      sessionSubmissionInputLabel(snapshot, id), capturedAt])

  const book = new ExcelJS.Workbook()
  addSheet(book, "双人本配对结果", ["玩家姓名1", "玩家编号1", "性别偏向1", "玩家姓名2", "玩家编号2", "性别偏向2", "类型", "性别偏向", "best_slot", "双人所有可用时间段", "total_score", "备注", "input_source", "captured_at"],
    duoRows, [16, 16, 14, 16, 16, 14, 12, 34, 30, 42, 14, 42, 30, 28], 2)
  addSheet(book, "多人本配对结果", ["组内玩家所有姓名", "组内玩家所有编号", "类型", "性别偏向（偏向男生人数vs偏向女生人数）", "best_slot", "多人组内所有可用共同时间段", "total_score", "备注", "input_source", "captured_at"],
    multiRows, [42, 46, 12, 36, 30, 42, 14, 48, 30, 28])
  addSheet(book, "未匹配名单", ["玩家姓名", "玩家编号", "类型", "性别偏向", "备注", "input_source", "captured_at"],
    unmatchedRows, [18, 16, 14, 16, 64, 30, 28], 2)
  addSheet(book, "结果发布", ["组别", "类型", "人数", "玩家姓名", "玩家编号", "推荐时间", "共同可用时间段"],
    publicationRows, [12, 12, 8, 44, 46, 30, 42])
  return book
}
