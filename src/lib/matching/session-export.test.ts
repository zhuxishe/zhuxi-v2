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
let queries: Array<{ table: string; memberIds?: string[] }>
const capturedAt = "2026-10-23T01:00:00Z"
function inputSnapshot(): MatchingInputSnapshot {
  return { snapshot_id: "input", captured_at: capturedAt, status: "sealed", source: { submissions: [
    { member_id: "a", member: { member_identity: { full_name: "不应复原的旧姓名" } } },
    { member_id: "b" },
    { member_id: "c", game_type_pref: "多人", gender_pref: "女", message: "原始备注",
      import_metadata: { source: "current", normalized_name: "c", raw_first_choice: "原始第一志愿" } },
  ] }, engine_input: { candidates: [{ submissionId: "a" }, { submissionId: "b" }, { submissionId: "c" }] } }
}

function rowsOf(sheet: ExcelJS.Worksheet): Record<string, unknown>[] {
  const headers = sheet.getRow(1).values as string[]
  return Array.from({ length: sheet.rowCount - 1 }, (_, index) => {
    const row = sheet.getRow(index + 2)
    return Object.fromEntries(headers.slice(1).map((header, cell) => [header, row.getCell(cell + 1).value]))
  })
}
async function workbook() {
  const result = await buildSessionExportWorkbook("session")
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(result.buffer as never)
  return book
}

beforeEach(() => {
  vi.resetAllMocks()
  queries = []
  tables = {
    match_sessions: [{ id: "session", session_name: "测试批次", status: "draft", round_id: "round", round: { round_name: "本轮" } }],
    match_results: [{ rank: 1, status: "draft", member_a_id: "a", member_b_id: "b", best_slot: "2026-10-25_晚上", total_score: 55 }],
    unmatched_diagnostics: [{ member_id: "c", reason: "无合适搭档", details: { count: 0 } }],
    match_round_submissions: [
      { member_id: "c", game_type_pref: "双人", gender_pref: "男", message: "后改备注" },
      { member_id: "d", game_type_pref: "都可以", gender_pref: "都可以", message: "后加手动成员" },
      { member_id: "later", message: "尚未参与的新报名者" },
    ],
    members: ["a", "b", "c", "d"].map((id) => ({ id, member_identity: { full_name: `当前姓名-${id}` } })),
  }
  mocks.admin.mockResolvedValue({ id: "admin", role: "super_admin" })
  mocks.snapshot.mockResolvedValue(inputSnapshot())
  mocks.from.mockImplementation((table: string) => {
    const request: { table: string; memberIds?: string[] } = { table }
    queries.push(request)
    let single = false
    const query: any = {
      select: () => query, eq: () => query, order: () => query, limit: () => query,
      in: (key: string, values: string[]) => { if (key === "member_id") request.memberIds = values; return query },
      single: () => { single = true; return query },
      then: (resolve: (response: unknown) => unknown, reject: (error: unknown) => unknown) => {
        let data = tables[table] ?? []
        if (request.memberIds) data = data.filter((row) => request.memberIds!.includes(row.member_id))
        return Promise.resolve({ data: single ? data[0] : data, error: null }).then(resolve, reject)
      },
    }
    return query
  })
})

describe("session export batch input provenance", () => {
  it("exports captured question values and current names after later answers change", async () => {
    const book = await workbook()
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(["配对结果", "未匹配名单"])
    expect(rowsOf(book.getWorksheet("未匹配名单")!)[0]).toMatchObject({
      member_id: "c", normalized_game_type_pref: "多人", gender_pref: "女", notes: "原始备注",
      raw_first_choice: "原始第一志愿", input_source: "初始批次输入快照", captured_at: capturedAt,
    })
    expect(rowsOf(book.getWorksheet("配对结果")!)[0]).toMatchObject({ member_1_name: "当前姓名-a", input_source: "初始批次输入快照" })
    expect(queries.some((query) => query.table === "match_round_submissions")).toBe(false)
  })

  it("keeps saved later manual additions without importing unrelated later submissions", async () => {
    tables.match_results[0].member_b_id = "d"
    tables.unmatched_diagnostics.push({ member_id: "d", reason: "人工调整" })
    const book = await workbook()
    expect(rowsOf(book.getWorksheet("配对结果")!)[0].input_source).toBe("含后续人工调整当前资料")
    const rows = rowsOf(book.getWorksheet("未匹配名单")!)
    expect(rows.find((row) => row.member_id === "d")).toMatchObject({ notes: "后加手动成员", input_source: "后续人工调整当前资料" })
    expect(rows.some((row) => row.member_id === "later")).toBe(false)
    expect(queries.filter((query) => query.table === "match_round_submissions" && query.memberIds)).toEqual([
      { table: "match_round_submissions", memberIds: ["d"] },
    ])
  })

  it("preserves legacy current-data fallback with an explicit source label", async () => {
    mocks.snapshot.mockResolvedValue(null)
    const book = await workbook()
    expect(rowsOf(book.getWorksheet("未匹配名单")!)[0]).toMatchObject({
      notes: "后改备注", normalized_game_type_pref: "双人", input_source: "历史批次当前资料（无快照）",
    })
  })

  it("does not rebuild a redacted batch from live forms", async () => {
    mocks.snapshot.mockResolvedValue({ ...inputSnapshot(), status: "redacted" })
    const book = await workbook()
    expect(rowsOf(book.getWorksheet("未匹配名单")!)[0]).toMatchObject({
      notes: "", normalized_game_type_pref: "", input_source: "输入快照已脱敏",
    })
    expect(queries.some((query) => query.table === "match_round_submissions")).toBe(false)
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
