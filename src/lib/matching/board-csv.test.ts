import { describe, expect, it } from "vitest"
import { inspectManualAdjustment } from "./adjustment-engine"
import { createBoardDraft, evaluateBoard, type BoardContext } from "./board-engine"
import { createBoardCsvTemplate, escapeBoardCsvReference, parseBoardCsv, readBoardCsvAssignments, serializeBoardCsv } from "./board-csv"
import { previewBoardCsvText } from "./board-csv-engine"
import { BOARD_CSV_HEADERS, MAX_BOARD_CSV_BYTES, type BoardCsvPerson } from "./board-csv-types"
import { pairKey } from "./pair-history"
import { createScoringV3Config } from "./scoring-policy"
import type { BoardDraft, BoardSourceRow } from "./board-types"
import type { MatchCandidate } from "./types"

const key = "fixture signing key, never a production secret"
const slot = "2026-11-14_下午", evening = "2026-11-14_晚上"
const sessionId = "fixture-session", revision = "saved-revision"
function fixture(count = 10) {
  const candidates: MatchCandidate[] = Array.from({ length: count }, (_, i) => ({ submissionId: String(i + 1), name: `玩家${i + 1}`, gameTypePref: "都可以", genderPref: "都可以", availability: { "2026-11-14": ["下午", "晚上"], "2026-11-15": ["上午"] }, formInterestTags: [], formSocialStyle: null, gender: "女", school: "示例大学", interestTags: [], socialTags: [], level: 1, compatibilityScore: 4, matchHistory: [], gameMode: null, hasProfile: true }))
  const context: BoardContext = { cohortMemberIds: candidates.map((person) => person.submissionId), originalRows: [], originalLayout: { waitingDuoIds: ["7"], brokenPairs: [], unmatchedMessage: "工作人员会继续协调。" }, engine: {
    candidates, idMap: candidates.map((person) => [person.submissionId, person.submissionId]), pairRelations: [], algorithm_version: "max_coverage_split:3", adapter_version: 2,
    config: createScoringV3Config({ version: "weighted_feedback:1", quizVersionId: "quiz", dimensionWeights: { E: .3, A: .3, O: .15, C: .1, N: .15 }, activityFeedback: [] }),
  } }
  const original = (ids: string[], id: string): BoardSourceRow => ({ ...inspectManualAdjustment(context.engine, ids).rows[0], id, status: "draft", best_slot: slot, total_score: 777 })
  context.originalRows = [original(["1", "2"], "saved-duo"), original(["3", "4", "5", "6"], "saved-pool")]
  const draft = createBoardDraft(context.originalRows, context.cohortMemberIds, context.originalLayout)
  const people: BoardCsvPerson[] = context.cohortMemberIds.map((id) => ({ id, name: `玩家${id}`, memberNumber: `ZXS_${id.padStart(3, "0")}`, gender: "female" }))
  const input = { sessionId, revision, draft, people, context }
  return { ...input, template: () => createBoardCsvTemplate(input, key).csv }
}
function edit(csv: string, modify: (cells: string[][]) => void): string {
  const parsed = parseBoardCsv(csv); expect(parsed.errors).toEqual([])
  const rows = parsed.records.map((record) => [...record.cells]); modify(rows)
  return serializeBoardCsv(rows)
}
function assign(rows: string[][], ids: string[], pool: string, code = "", section = "", time = slot) {
  for (const row of rows.slice(1).filter((cells) => ids.includes(cells[0]))) { row[4] = pool; row[5] = code; row[6] = section; row[7] = code ? time.split("_")[0] : ""; row[8] = code ? time.split("_")[1] : "" }
}
function preview(f: ReturnType<typeof fixture>, csvText = f.template()) { return previewBoardCsvText({ ...f, csvText }, key) }

describe("bounded RFC4180 matching CSV", () => {
  it("round-trips BOM, quotes, commas and CRLF inside reference names with physical line numbers", () => {
    const source = serializeBoardCsv([BOARD_CSV_HEADERS, ["id", "number", "姓,名\r\n\"昵称\"", "女", "未匹配", "", "", "", "", "token"], ["id2", "", "二", "男", "未匹配", "", "", "", "", "token"]])
    const result = parseBoardCsv(source)
    expect(result.errors).toEqual([])
    expect(result.records[1]).toMatchObject({ row: 2, cells: expect.arrayContaining(["姓,名\r\n\"昵称\""]) })
    expect(result.records[2].row).toBe(4)
    expect(parseBoardCsv(source.slice(1).replaceAll("\r\n", "\n")).errors).toEqual([])
  })
  it.each(["\"unclosed", "a\"quote", "\"quoted\"junk", "name\0value"])("rejects malformed input %j", (input) => {
    expect(parseBoardCsv(input).errors.length).toBeGreaterThan(0)
  })
  it("rejects oversize and excessively wide fields before processing a roster", () => {
    expect(parseBoardCsv("字".repeat(MAX_BOARD_CSV_BYTES / 3 + 1)).errors[0].message).toContain("过大")
    expect(parseBoardCsv('"' + "a".repeat(9000) + '"').errors[0].message).toContain("字段")
  })
  it("escapes formula-like reference cells and accepts a normal Excel roundtrip without executing values", () => {
    const f = fixture(); f.people[0].name = "=HYPERLINK(\"https://example.invalid\")"; f.people[1].memberNumber = " +123"
    const csv = f.template(), cells = parseBoardCsv(csv).records
    expect(cells[1].cells[2]).toBe("'" + f.people[0].name)
    expect(cells[2].cells[1]).toBe("' +123")
    expect(preview(f, csv).preview?.unchanged).toBe(true)
    expect(preview(f, edit(csv, (rows) => { rows[1][2] = f.people[0].name })).preview?.unchanged).toBe(true)
    expect(escapeBoardCsvReference("'literal")).toBe("''literal")
  })
})

describe("signed full-cohort template", () => {
  it("preserves an unchanged legacy pool, original IDs/scores, staff message and all order", () => {
    const f = fixture(), before = structuredClone({ context: f.context, draft: f.draft })
    const result = preview(f)
    expect(result.errors).toBeUndefined(); expect(result.preview?.unchanged).toBe(true)
    expect(result.preview?.draft).toEqual(f.draft)
    expect(result.preview?.rows.map((row) => [row.resultId, row.total_score])).toEqual([["saved-duo", 777], ["saved-pool", 777]])
    expect(result.preview?.draft.unmatchedMessage).toBe("工作人员会继续协调。")
    expect(f.context).toEqual(before.context)
    expect(f.draft).toEqual(before.draft)
  })
  it("allows reordered rows, reordered columns and cosmetic group renumbering without rebuilding results", () => {
    const f = fixture()
    const csv = edit(f.template(), (rows) => {
      for (const row of rows.slice(1)) { if (row[5] === "D01") row[5] = "D99"; if (row[5] === "M01") row[5] = "多人第一组" }
      const header = rows.shift()!; rows.reverse(); rows.unshift(header)
      rows.forEach((row) => { [row[0], row[2]] = [row[2], row[0]] })
    })
    expect(preview(f, csv).preview).toMatchObject({ unchanged: true, draft: f.draft, changes: [] })
  })
  it.each(["missing", "duplicate", "outside", "reference", "metadata", "mixed", "formula", "headers"])("rejects %s without changing the saved scheme", (kind) => {
    const f = fixture(), before = structuredClone(f.draft)
    const csv = edit(f.template(), (rows) => {
      if (kind === "missing") rows.pop()
      if (kind === "duplicate") rows.push([...rows[1]])
      if (kind === "outside") rows[1][0] = "outside"
      if (kind === "reference") rows[1][2] = "另外一个名字"
      if (kind === "metadata") rows.forEach((row, i) => { if (i) row[9] = row[9].slice(0, -1) + "!" })
      if (kind === "mixed") rows[1][9] += "X"
      if (kind === "formula") rows[1][5] = "=1+1"
      if (kind === "headers") rows[0][0] = "改名"
    })
    const result = preview(f, csv)
    expect(result.error).toBeTruthy(); expect(result.preview).toBeUndefined(); expect(result.errors?.length).toBeGreaterThan(0)
    expect(f.draft).toEqual(before)
  })
  it("rejects another batch, old revision, changed references and a forged signature", () => {
    const f = fixture(), csvText = f.template()
    expect(previewBoardCsvText({ ...f, sessionId: "other", csvText }, key).errors?.[0].message).toContain("不属于")
    expect(previewBoardCsvText({ ...f, revision: "new", csvText }, key).stale).toBe(true)
    expect(previewBoardCsvText({ ...f, people: f.people.map((person) => ({ ...person, name: person.name + "更新" })), csvText }, key).preview).toBeUndefined()
    expect(previewBoardCsvText({ ...f, csvText }, "different signing key private").preview).toBeUndefined()
  })
  it("reports missing cohort members and returns original physical line numbers for row errors", () => {
    const f = fixture(); f.people[0].name = "跨行\r\n姓名"
    const csv = edit(f.template(), (rows) => { rows[2][4] = "非法池子"; rows.pop() })
    const result = preview(f, csv)
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 4, member: "玩家2" }), expect.objectContaining({ member: "玩家10", message: expect.stringContaining("缺少") })]))
  })
  it("normalizes unambiguous Excel year/month/day dates but rejects ambiguous and serial dates", () => {
    const f = fixture()
    const compatible = preview(f, edit(f.template(), (rows) => { rows.forEach((row, i) => { if (i && row[7]) row[7] = "2026/11/14" }) }))
    expect(compatible.preview?.unchanged).toBe(true)
    expect(compatible.warnings?.join()).toContain("YYYY-MM-DD")
    for (const date of ["11/14/26", "14/11/2026", "46340", "2026/2/31", "=DATE(2026,11,14)"]) {
      expect(preview(f, edit(f.template(), (rows) => { rows[1][7] = date })).preview).toBeUndefined()
    }
  })
  it("rejects a duplicate source roster rather than silently collapsing template rows", () => {
    const f = fixture(); f.draft.unmatchedIds.push("1")
    expect(() => f.template()).toThrow("人员名单")
  })
})

describe("complete manual board import", () => {
  it("bulk regroups everyone and preserves manually chosen duo time through the final save evaluation", () => {
    const f = fixture()
    const csv = edit(f.template(), (rows) => {
      assign(rows, ["1", "8"], "双人", "D11", "", evening)
      assign(rows, ["2", "7"], "双人", "D12", "", evening)
      assign(rows, ["3", "4", "5", "6", "9", "10"], "多人", "M03", "4–6人分组", evening)
    })
    const result = preview(f, csv), changed = result.preview!
    expect(result.error).toBeUndefined()
    expect(changed.summary).toMatchObject({ changedMembers: 10, createdGroups: 3, removedGroups: 2, after: { duoGroups: 2, multiGroups: 1, matched: 10, unmatched: 0 } })
    expect(changed.draft.duos.every((duo) => duo.manuallyScheduled && duo.bestSlot === evening)).toBe(true)
    expect(evaluateBoard(f.context, changed.draft, true).changedRows.every((row) => row.best_slot === evening)).toBe(true)
    expect(changed.draft.unmatchedMessage).toBe(f.draft.unmatchedMessage)
  })
  it("allows manual seven-person small groups with a warning and preserves an unrelated saved pair", () => {
    const f = fixture(11)
    const csv = edit(f.template(), (rows) => assign(rows, ["3", "4", "5", "6", "7", "8", "9"], "多人", "M07", "4-6人分组"))
    const result = preview(f, csv)
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining("7人")]))
    expect(result.preview?.draft.multiGroups?.[0]).toMatchObject({ groupKind: "small", manuallyAdjusted: true, memberIds: ["3", "4", "5", "6", "7", "8", "9"] })
    expect(result.preview?.rows.find((row) => row.member_b_id)?.resultId).toBe("saved-duo")
    expect(evaluateBoard(f.context, result.preview!.draft, true).keepResultIds).toEqual(["saved-duo"])
  })
  it("supports waiting pools, rejects times on ungrouped people, and retains surviving grey references", () => {
    const f = fixture()
    f.context.originalLayout = { ...f.context.originalLayout!, waitingDuoIds: ["7", "8"], brokenPairs: [{ key: "grey", memberIds: ["7", "8"] }] }
    f.draft = createBoardDraft(f.context.originalRows, f.context.cohortMemberIds, f.context.originalLayout)
    const template = createBoardCsvTemplate(f, key).csv
    const changed = preview(f, edit(template, (rows) => assign(rows, ["9"], "多人")))
    expect(changed.preview?.draft.brokenPairs).toEqual(f.draft.brokenPairs)
    expect(changed.preview?.summary.after.waitingMulti).toBe(1)
    expect(changed.warnings?.join()).toContain("等待多人分组")
    const invalid = preview(f, edit(template, (rows) => { const nine = rows.find((row) => row[0] === "9")!; nine[7] = "2026-11-14" }))
    expect(invalid.errors?.some((issue) => issue.message.includes("留空") || issue.message.includes("不填写"))).toBe(true)
  })
  it.each(["inconsistent", "duo-count", "multi-count", "bad-date", "no-common", "blacklist", "type", "gender"])("rejects %s before producing an editable import", (kind) => {
    const f = fixture()
    const csv = edit(f.template(), (rows) => {
      assign(rows, ["1", "8"], "双人", "D08", "", evening)
      assign(rows, ["2"], "双人")
      if (kind === "inconsistent") rows.find((row) => row[0] === "8")![8] = "下午"
      if (kind === "duo-count") assign(rows, ["9"], "双人", "D08", "", evening)
      if (kind === "multi-count") { assign(rows, ["3", "4"], "多人", "M02", "按时间分组"); assign(rows, ["5", "6"], "未匹配") }
      if (kind === "bad-date") rows.find((row) => row[0] === "8")![7] = "2026-02-31"
      if (kind === "no-common") f.context.engine.candidates[7].availability = { "2026-11-15": ["上午"] }
      if (kind === "blacklist") f.context.engine.pairRelations.push([pairKey("1", "8"), { playerA: "1", playerB: "8", status: "blacklist", totalPairCount: 1, hasMutualFive: false, reason: "private fixture" }])
      if (kind === "type") f.context.engine.candidates[7].gameTypePref = "多人"
      if (kind === "gender") { f.context.engine.candidates[0].genderPref = "女"; f.context.engine.candidates[7].gender = "男" }
    })
    const result = preview(f, csv)
    expect(result.preview).toBeUndefined(); expect(result.errors?.length).toBeGreaterThan(0)
    expect(result.errors?.some((issue) => issue.row && (issue.group || issue.member))).toBe(true)
  })
  it.each(["whole-pair", "personal-pool", "both-pins"])("enforces %s locks with contextual row errors", (kind) => {
    const f = fixture()
    if (kind === "whole-pair") f.context.originalRows[0].status = "locked"
    if (kind === "personal-pool") f.context.lockedMemberIds = ["1"]
    if (kind === "both-pins") f.context.lockedMemberIds = ["1", "2"]
    const csv = edit(f.template(), (rows) => { assign(rows, ["1", "2"], "未匹配") })
    const result = preview(f, csv)
    expect(result.preview).toBeUndefined()
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: expect.any(Number), member: expect.stringContaining("玩家1"), message: expect.stringContaining("锁定") })]))
  })
  it("retains one-person pin while allowing a different compatible duo partner", () => {
    const f = fixture(); f.context.lockedMemberIds = ["1"]
    const csv = edit(f.template(), (rows) => { assign(rows, ["1", "8"], "双人", "D08"); assign(rows, ["2"], "双人") })
    expect(preview(f, csv).preview?.draft.duos[0].memberIds).toEqual(["1", "8"])
  })
  it("reports a time-only change without marking the pair as dissolved/recreated in the diff summary", () => {
    const f = fixture()
    const result = preview(f, edit(f.template(), (rows) => assign(rows, ["1", "2"], "双人", "D01", "", evening)))
    expect(result.preview?.summary).toMatchObject({ changedMembers: 2, changedTimes: 1, createdGroups: 0, removedGroups: 0 })
    expect(result.preview?.draft.multiMode).toBeUndefined()
    expect(result.preview?.draft.multi?.resultId).toBe("saved-pool")
  })
  it("rejects forged manuallyScheduled metadata and incompatible chosen duo times at final save", () => {
    const f = fixture(), changed: BoardDraft = structuredClone(f.draft)
    changed.duos[0].bestSlot = "2026-11-16_晚上"; changed.duos[0].manuallyScheduled = true
    expect(() => evaluateBoard(f.context, changed, true)).toThrow("双方共同")
    Object.assign(changed.duos[0], { manuallyScheduled: "true" })
    expect(() => evaluateBoard(f.context, changed, true)).toThrow("调整内容无效")
    const parsed = readBoardCsvAssignments({ ...f, csvText: f.template() }, key)
    expect(parsed.assignments).toHaveLength(10)
  })
})
