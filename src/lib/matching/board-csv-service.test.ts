import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createScoringV3Config } from "./scoring-policy"
import { inspectManualAdjustment } from "./adjustment-engine"
import { createBoardDraft } from "./board-engine"
import { createBoardCsvTemplate } from "./board-csv"
import { BOARD_CSV_HEADERS } from "./board-csv-types"
import type { MatchingEngineInput } from "./run-input"
import type { BoardSourceRow } from "./board-types"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), db: vi.fn(), prepare: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.db }))
vi.mock("./run-input", async (original) => ({ ...await original<typeof import("./run-input")>(), prepareMatchingRunInput: mocks.prepare }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { applyMatchingBoardCsv, buildMatchingBoardCsvTemplate, previewMatchingBoardCsv } from "./board-csv-service"

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const sessionId = id(90), actor = id(91), round = id(92), key = "isolated-csv-signing-key-not-a-production-credential"
const revision = "saved-current", slot = "2026-11-14_下午"
function fixture() {
  const candidates: MatchingEngineInput["candidates"] = Array.from({ length: 6 }, (_, i) => ({ submissionId: id(i + 1), name: `成员${i + 1}`, gameTypePref: "都可以", genderPref: "都可以", availability: { "2026-11-14": ["下午", "晚上"] }, formInterestTags: [], formSocialStyle: null, gender: "女", school: null, interestTags: [], socialTags: [], level: 1, compatibilityScore: 4, matchHistory: [], gameMode: null, hasProfile: true }))
  const engine: MatchingEngineInput = { algorithm_version: "max_coverage_split:3", adapter_version: 2, candidates, idMap: candidates.map((member) => [member.submissionId, member.submissionId]), pairRelations: [], config: createScoringV3Config({ version: "weighted_feedback:1", quizVersionId: "quiz", dimensionWeights: { E: .3, A: .3, O: .15, C: .1, N: .15 }, activityFeedback: [] }) }
  const row: BoardSourceRow = { ...inspectManualAdjustment(engine, [id(1), id(2)]).rows[0], id: id(80), status: "draft", best_slot: slot, total_score: 123.456 }
  Object.assign(row, { audit_reason: "PRIVATE-AUDIT", locked_by: "PRIVATE-ACTOR" })
  const people = candidates.map((member, i) => ({ id: member.submissionId, name: member.name, memberNumber: `ZXS_${i + 1}`, gender: "female" }))
  const capture = { session_id: sessionId, round_id: round, session_status: "draft", read_only: false, base_revision: revision, cohort_member_ids: candidates.map((member) => member.submissionId), results: [row], locked_member_ids: [], layout: { waitingDuoIds: [], brokenPairs: [], unmatchedMessage: "请留意后续安排。" },
    capture: { source: { submissions: people.map((person) => ({ member_id: person.id, availability: { "2026-11-14": ["下午", "晚上"] }, member: { member_number: person.memberNumber, anonymized_at: null, member_identity: { full_name: person.name, gender: person.gender }, private_data: "PRIVATE-PROFILE" }, message: "PRIVATE-REGISTRATION-NOTE" })), feedbacks: "PRIVATE-FEEDBACK", blacklist: "PRIVATE-RELATIONS" } } }
  const rpc = vi.fn().mockResolvedValue({ data: capture, error: null })
  mocks.db.mockReturnValue({ rpc }); mocks.prepare.mockReturnValue({ engineInput: engine })
  const draft = createBoardDraft(capture.results, capture.cohort_member_ids, capture.layout)
  const csv = createBoardCsvTemplate({ sessionId, revision, draft, people }, key).csv
  return { engine, capture, rpc, people, draft, csv }
}

beforeEach(() => { vi.resetAllMocks(); mocks.admin.mockResolvedValue({ id: actor, role: "super_admin" }); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", key) })
afterEach(() => { vi.unstubAllEnvs() })

describe("CSV read-only service boundary", () => {
  it("requires super-admin authorization before reading or signing any template", async () => {
    const f = fixture(); mocks.admin.mockResolvedValue({ id: actor, role: "admin" })
    await expect(buildMatchingBoardCsvTemplate(sessionId, revision)).rejects.toThrow("超级管理员")
    expect(await previewMatchingBoardCsv({ sessionId, expectedRevision: revision, csvText: f.csv })).toMatchObject({ error: expect.stringContaining("超级管理员") })
    expect(await applyMatchingBoardCsv({ sessionId, expectedRevision: revision, csvText: f.csv })).toMatchObject({ error: expect.stringContaining("超级管理员") })
    expect(f.rpc).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it("downloads a signed current saved template without private profile, audit, registration notes or credentials", async () => {
    const f = fixture(), exported = await buildMatchingBoardCsvTemplate(sessionId, revision)
    expect(exported.csv.startsWith("\uFEFF")).toBe(true)
    for (const header of BOARD_CSV_HEADERS) expect(exported.csv).toContain(header)
    expect(exported.csv).toContain("成员1")
    expect(exported.csv).not.toContain(key); expect(exported.csv).not.toContain("PRIVATE-")
    expect(exported.csv).not.toContain("请留意后续安排。")
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["admin_get_matching_board"])
  })
  it("previews and applies only as returned local drafts, keeping saved source rows and message unchanged", async () => {
    const f = fixture(), before = structuredClone(f.capture)
    const input = { sessionId, expectedRevision: revision, csvText: f.csv }
    const preview = await previewMatchingBoardCsv(input), applied = await applyMatchingBoardCsv(input)
    expect(preview.preview?.unchanged).toBe(true)
    expect(applied.preview?.draft.unmatchedMessage).toBe("请留意后续安排。")
    expect(applied.preview?.rows[0].total_score).toBe(123.456)
    expect(JSON.stringify(applied)).not.toContain("PRIVATE-")
    expect(JSON.stringify(applied)).not.toContain(key)
    expect(f.capture).toEqual(before)
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["admin_get_matching_board", "admin_get_matching_board"])
  })
  it("rechecks revision and current publication status before applying a previously valid file", async () => {
    const f = fixture(), input = { sessionId, expectedRevision: revision, csvText: f.csv }
    expect((await previewMatchingBoardCsv(input)).success).toBe(true)
    f.capture.base_revision = "another-admin-saved"
    expect(await applyMatchingBoardCsv(input)).toMatchObject({ stale: true, error: expect.stringContaining("重新下载") })
    f.capture.base_revision = revision; f.capture.session_status = "confirmed"
    expect(await applyMatchingBoardCsv(input)).toMatchObject({ stale: true, error: expect.stringContaining("已发布") })
    expect(f.rpc.mock.calls.every(([name]) => name === "admin_get_matching_board")).toBe(true)
  })
  it("rejects missing versions, malformed cohort and read failures without private data", async () => {
    const f = fixture()
    expect(await previewMatchingBoardCsv({ sessionId, expectedRevision: "", csvText: f.csv })).toMatchObject({ stale: true })
    f.capture.cohort_member_ids.push(id(1))
    expect(await previewMatchingBoardCsv({ sessionId, expectedRevision: revision, csvText: f.csv })).toMatchObject({ error: expect.stringContaining("资料不完整") })
    f.rpc.mockResolvedValue({ data: null, error: { message: "PRIVATE-DATABASE-DIAGNOSTIC" } })
    const result = await applyMatchingBoardCsv({ sessionId, expectedRevision: revision, csvText: f.csv })
    expect(result.error).toContain("暂时无法读取"); expect(JSON.stringify(result)).not.toContain("PRIVATE-")
  })
  it("rejects a changed reviewed signature and a missing signing secret without manufacturing a template", async () => {
    fixture()
    await expect(buildMatchingBoardCsvTemplate(sessionId, revision, "another-review")).rejects.toThrow("核对内容已变化")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
    await expect(buildMatchingBoardCsvTemplate(sessionId, revision)).rejects.toThrow("暂时不可用")
  })
})
