import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import type { BoardDraft } from "./board-types"
import { BOARD_CSV_HEADERS, MAX_BOARD_CSV_BYTES, type BoardCsvAssignment, type BoardCsvIssue, type BoardCsvPerson, type BoardCsvRecord } from "./board-csv-types"

const MAX_RECORDS = 10_001
const MAX_FIELD = 8192
const TOKEN_DOMAIN = "zhuxishe:matching-board-csv:1:"
const slotKey = (slot: string | null) => slot?.replace(" ", "_") ?? null
const gender = (value: string | null) => value === "male" ? "男" : value === "female" ? "女" : value === "other" ? "其他" : "未填写"
const formula = /^[\s]*[=+\-@\t\r\n']/u
/** Quoting is not sufficient for Excel formula safety. */
export const escapeBoardCsvReference = (value: string) => formula.test(value) ? `'${value}` : value

export function serializeBoardCsv(rows: readonly (readonly string[])[]): string {
  return "\uFEFF" + rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n") + "\r\n"
}

/** Bounded RFC4180 reader; physical line numbers survive quoted line breaks. */
export function parseBoardCsv(csvText: string): { records: BoardCsvRecord[]; errors: BoardCsvIssue[] } {
  if (typeof csvText !== "string" || Buffer.byteLength(csvText, "utf8") > MAX_BOARD_CSV_BYTES) return { records: [], errors: [{ message: "CSV文件过大，请使用不超过1.5MB的调整模板。" }] }
  const input = csvText.replace(/^\uFEFF/u, ""), records: BoardCsvRecord[] = []
  let field = "", cells: string[] = [], quoted = false, closed = false, line = 1, start = 1
  const error = (message: string) => ({ records: [], errors: [{ row: line, message }] })
  const pushField = () => { cells.push(field); field = ""; closed = false }
  const pushRecord = () => { pushField(); if (cells.some((cell) => cell.trim() !== "")) records.push({ cells, row: start }); cells = []; start = line + 1 }
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (c === "\0") return error("CSV含有无效字符，请另存为UTF-8 CSV。")
    if (quoted) {
      if (c === '"') { if (input[i + 1] === '"') { field += '"'; i++ } else { quoted = false; closed = true } }
      else if (c === "\r" || c === "\n") { field += c; if (c === "\r" && input[i + 1] === "\n") { field += "\n"; i++ }; line++ }
      else field += c
    } else if (c === ",") pushField()
    else if (c === "\r" || c === "\n") { pushRecord(); if (c === "\r" && input[i + 1] === "\n") i++; line++ }
    else if (c === '"') { if (field || closed) return error("引号格式无效，请使用原模板另存为CSV。") ; quoted = true }
    else { if (closed) return error("引号后存在多余内容，请检查该行格式。") ; field += c }
    if (field.length > MAX_FIELD || cells.length > BOARD_CSV_HEADERS.length) return error("CSV字段或列数超出模板范围。")
    if (records.length > MAX_RECORDS) return error("CSV人员行数超出本批处理范围。")
  }
  if (quoted) return error("CSV引号未闭合，请检查该行。")
  if (field || cells.length || closed) { pushField(); if (cells.some((cell) => cell.trim() !== "")) records.push({ cells, row: start }) }
  return { records, errors: [] }
}

function fingerprint(people: readonly BoardCsvPerson[]) {
  return createHash("sha256").update(JSON.stringify([...people].sort((a, b) => a.id.localeCompare(b.id)).map(({ id, name, memberNumber, gender }) => ({ id, name, memberNumber, gender })))).digest("hex")
}
function signature(body: string, key: string) {
  if (typeof key !== "string" || key.length < 16) throw new Error("暂时无法生成或核验调整模板，请稍后重试。")
  return createHmac("sha256", key).update(TOKEN_DOMAIN + body).digest("base64url")
}
function tokenFor(sessionId: string, revision: string, people: readonly BoardCsvPerson[], key: string) {
  const body = Buffer.from(JSON.stringify({ v: 1, sessionId, revision, people: fingerprint(people) })).toString("base64url")
  return `${body}.${signature(body, key)}`
}
function inspectToken(token: string, sessionId: string, revision: string, people: readonly BoardCsvPerson[], key: string): { error?: string; stale?: boolean } {
  if (!/^[A-Za-z0-9_-]{1,6000}\.[A-Za-z0-9_-]{43}$/u.test(token)) return { error: "模板校验信息缺失或已修改，请重新下载调整模板。" }
  const [body, actual] = token.split("."), expected = signature(body, key)
  if (!timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) return { error: "模板校验信息无效，请使用本系统下载的原模板。" }
  try {
    const payload: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
    if (!payload || typeof payload !== "object" || !("v" in payload) || payload.v !== 1 || !("sessionId" in payload) || payload.sessionId !== sessionId) return { error: "此模板不属于当前匹配批次，请重新下载。" }
    if (!("revision" in payload) || payload.revision !== revision || !("people" in payload) || payload.people !== fingerprint(people)) return { error: "模板版本已过期，方案、人员资料或锁定状态已变化，请重新下载模板。", stale: true }
    return {}
  } catch { return { error: "模板校验信息无效，请重新下载。" } }
}

export function boardCsvAssignments(draft: BoardDraft): Map<string, Omit<BoardCsvAssignment, "memberId" | "row">> {
  const map = new Map<string, Omit<BoardCsvAssignment, "memberId" | "row">>()
  draft.duos.forEach((duo, index) => duo.memberIds.forEach((id) => map.set(id, { pool: "双人", groupCode: `D${String(index + 1).padStart(2, "0")}`, section: null, slot: slotKey(duo.bestSlot) })))
  const multis = draft.multiMode === "grouped" ? draft.multiGroups ?? [] : draft.multi ? [draft.multi] : []
  multis.forEach((group, index) => group.memberIds.forEach((id) => map.set(id, { pool: "多人", groupCode: `M${String(index + 1).padStart(2, "0")}`, section: group.groupKind === "small" ? "small" : "time", slot: slotKey(group.bestSlot) })))
  draft.waitingDuoIds.forEach((id) => map.set(id, { pool: "双人", groupCode: "", section: null, slot: null }))
  if (draft.multiMode === "grouped") draft.multi?.memberIds.forEach((id) => map.set(id, { pool: "多人", groupCode: "", section: null, slot: null }))
  draft.unmatchedIds.forEach((id) => map.set(id, { pool: "未匹配", groupCode: "", section: null, slot: null }))
  return map
}

export function createBoardCsvTemplate(input: { sessionId: string; revision: string; draft: BoardDraft; people: readonly BoardCsvPerson[] }, signingKey: string): { csv: string; fileName: string } {
  const assignments = boardCsvAssignments(input.draft), token = tokenFor(input.sessionId, input.revision, input.people, signingKey)
  const ids = [...input.draft.duos.flatMap((duo) => duo.memberIds), ...(input.draft.multi?.memberIds ?? []), ...(input.draft.multiGroups ?? []).flatMap((group) => group.memberIds), ...input.draft.waitingDuoIds, ...input.draft.unmatchedIds]
  if (new Set(input.people.map((p) => p.id)).size !== input.people.length || new Set(ids).size !== ids.length || assignments.size !== input.people.length || input.people.some((p) => !assignments.has(p.id))) throw new Error("人员名单不完整，暂时无法生成调整模板。")
  const rows = input.people.map((person) => {
    const item = assignments.get(person.id)!, parts = item.slot?.split("_")
    return [person.id, escapeBoardCsvReference(person.memberNumber ?? ""), escapeBoardCsvReference(person.name), gender(person.gender), item.pool, item.groupCode, item.section === "small" ? "4–6人分组" : item.section === "time" ? "按时间分组" : "", parts?.[0] ?? "", parts?.[1] ?? "", token]
  })
  const csv = serializeBoardCsv([BOARD_CSV_HEADERS, ...rows])
  if (Buffer.byteLength(csv, "utf8") > MAX_BOARD_CSV_BYTES) throw new Error("本批模板超过1.5MB，请联系工作人员处理。")
  return { csv, fileName: `匹配人工调整_${input.sessionId}.csv` }
}

function referenceMatches(actual: string, value: string) { return actual === value || actual === escapeBoardCsvReference(value) }
function validDate(date: string) { return /^\d{4}-\d{2}-\d{2}$/u.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date }

export function readBoardCsvAssignments(input: { sessionId: string; revision: string; people: readonly BoardCsvPerson[]; csvText: string }, signingKey: string): { assignments?: BoardCsvAssignment[]; errors: BoardCsvIssue[]; stale?: boolean; warnings?: string[] } {
  const parsed = parseBoardCsv(input.csvText)
  if (parsed.errors.length) return { errors: parsed.errors }
  const header = parsed.records[0]
  if (!header || header.cells.length !== BOARD_CSV_HEADERS.length || new Set(header.cells).size !== BOARD_CSV_HEADERS.length || BOARD_CSV_HEADERS.some((name) => !header.cells.includes(name))) return { errors: [{ row: header?.row ?? 1, message: "模板列不完整或列名已修改，请保留全部原有列名。" }] }
  const positions = BOARD_CSV_HEADERS.map((name) => header.cells.indexOf(name)), people = new Map(input.people.map((person) => [person.id, person]))
  const errors: BoardCsvIssue[] = [], assignments: BoardCsvAssignment[] = [], seen = new Set<string>(), tokens = new Set<string>()
  let normalizedExcelDate = false
  for (const record of parsed.records.slice(1)) {
    if (record.cells.length !== BOARD_CSV_HEADERS.length) { errors.push({ row: record.row, message: "该行列数与模板不一致。" }); continue }
    const [id, number, name, sex, pool, groupCode, section, date, period, token] = positions.map((index) => record.cells[index])
    tokens.add(token)
    const person = people.get(id), issue = (message: string) => errors.push({ row: record.row, ...(person ? { member: person.name } : {}), ...(groupCode.trim() ? { group: groupCode.trim() } : {}), message })
    if (!person) { issue("玩家标识不属于本批次或已被修改。" ); continue }
    if (seen.has(id)) issue("同一玩家重复出现，每人只能保留一行。")
    seen.add(id)
    if (!referenceMatches(number, person.memberNumber ?? "") || !referenceMatches(name, person.name) || sex !== gender(person.gender)) issue("会员编号、姓名或玩家性别是参考信息，请勿修改。")
    const target = pool.trim(), code = groupCode.trim(), field = section.trim(), rawDay = date.trim(), time = period.trim()
    const excelDate = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/u.exec(rawDay)
    const day = excelDate ? `${excelDate[1]}-${excelDate[2].padStart(2, "0")}-${excelDate[3].padStart(2, "0")}` : rawDay
    if (excelDate && validDate(day)) normalizedExcelDate = true
    if (!["双人", "多人", "未匹配"].includes(target)) { issue("目标池只能填写双人、多人或未匹配。" ); continue }
    if (code && !/^[A-Za-z0-9\u3400-\u9fff][A-Za-z0-9\u3400-\u9fff _-]{0,63}$/u.test(code)) issue("组号须为64字以内的字母、数字、中文、空格、横线或下划线，不能是公式。")
    if (target === "未匹配" && (code || field || day || time)) issue("未匹配人员的组号、多人分组栏和推荐时间应留空。")
    if (!code && (field || day || time)) issue("等待搭档或待分组人员不填写分组栏和推荐时间。")
    if (target === "双人" && field) issue("双人组不填写多人分组栏。")
    if (target === "多人" && code && !["4–6人分组", "4-6人分组", "按时间分组"].includes(field)) issue("多人正式组的分组栏须填写4–6人分组或按时间分组。")
    if (code && (!validDate(day) || !["上午", "下午", "晚上"].includes(time))) issue("正式小组须填写有效推荐日期（YYYY-MM-DD）和上午／下午／晚上。")
    assignments.push({ memberId: id, row: record.row, pool: target as BoardCsvAssignment["pool"], groupCode: code, section: field === "4–6人分组" || field === "4-6人分组" ? "small" : field === "按时间分组" ? "time" : null, slot: code ? `${day}_${time}` : null })
  }
  for (const person of input.people) if (!seen.has(person.id)) errors.push({ member: person.name, message: "CSV缺少此玩家，必须保留本批每个人且仅出现一次。" })
  if (tokens.size !== 1) errors.push({ message: "每行必须保留相同的模板信息，请勿混合不同文件。" })
  if (errors.length) return { errors }
  const check = inspectToken([...tokens][0] ?? "", input.sessionId, input.revision, input.people, signingKey)
  if (check.error) return { errors: [{ message: check.error }], stale: check.stale }
  return { assignments, errors: [], ...(normalizedExcelDate ? { warnings: ["CSV中的年／月／日日期已统一规范为YYYY-MM-DD；分组时间以预览为准。"] } : {}) }
}
