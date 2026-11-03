import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn(), from: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }))
import { fetchSavedMatchingReview, MatchingReviewStaleError, readSavedMatchingReview } from "./session-review-service"

const sessionId = "10000000-0000-4000-8000-000000000001"
const actor = "10000000-0000-4000-8000-000000000002"
const members = ["10000000-0000-4000-8000-000000000003", "10000000-0000-4000-8000-000000000004"]
const waiting = "10000000-0000-4000-8000-000000000005"
const unmatched = "10000000-0000-4000-8000-000000000006"
type Diagnostic = { session_id: string; member_id: string; reason: string; details: unknown; member: { anonymized_at: string | null }; private_note?: string }
let diagnostics: Diagnostic[]
let diagnosticError: unknown
let diagnosticCount: number | null | undefined
let queryReads: Array<{ table: string; columns?: string; exactCount?: boolean; session?: string; ids?: string[]; anonymousFilter?: boolean; order?: string }>
function capture() {
  return { base_revision: "current-revision", session_status: "draft", cohort_member_ids: members, layout: null,
    results: [{ id: "result", status: "draft", member_a_id: members[0], member_b_id: members[1], group_members: null, best_slot: "2026-11-04_下午", rank: 1, total_score: 80, score_breakdown: { secret: "PRIVATE-SCORE" } }],
    capture: { captured_at: "2026-11-02T10:00:00Z", source: { submissions: members.map((id, i) => ({ member_id: id,
      availability: { "2026-11-04": ["下午", "晚上"] }, member: { member_number: `ZXS_${i}`, member_identity: { full_name: `Name ${i}`, gender: i === 0 ? "male" : "female", secret: "PRIVATE-IDENTITY" } }, message: "PRIVATE-NOTE" })), blacklist: "PRIVATE-RELATION" } } }
}
function unassignedCapture() {
  const original = capture()
  const extra = [waiting, unmatched].map((id) => ({ ...structuredClone(original.capture.source.submissions[0]), member_id: id }))
  return { ...original, cohort_member_ids: [...members, waiting, unmatched],
    layout: { waitingDuoIds: [waiting], brokenPairs: [] },
    capture: { ...original.capture, source: { ...original.capture.source, submissions: [...original.capture.source.submissions, ...extra] } } }
}
function diagnostic(member_id: string, session_id = sessionId): Diagnostic {
  return { session_id, member_id, reason: "no_common_time", details: { version: "matching_diagnostic:1", code: "no_common_time" }, member: { anonymized_at: null }, private_note: "PRIVATE-AUDIT" }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.admin.mockResolvedValue({ id: actor, role: "super_admin" })
  mocks.rpc.mockResolvedValue({ data: capture(), error: null })
  diagnostics = []; diagnosticError = null; diagnosticCount = undefined; queryReads = []
  mocks.from.mockImplementation((table: string) => {
    const request: (typeof queryReads)[number] = { table }
    queryReads.push(request)
    const query = {
      select: (columns: string, options: unknown) => { expect(options).toEqual({ count: "exact" }); request.columns = columns; request.exactCount = true; return query },
      eq: (key: string, value: string) => { expect(key).toBe("session_id"); request.session = value; return query },
      in: (key: string, ids: string[]) => { expect(key).toBe("member_id"); request.ids = ids; return query },
      is: (key: string, value: unknown) => { expect([key, value]).toEqual(["member.anonymized_at", null]); request.anonymousFilter = true; return query },
      order: (key: string, options: unknown) => { expect(options).toEqual({ ascending: true }); request.order = key; return query },
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
        const selected = diagnostics.filter((row) => row.session_id === request.session && request.ids?.includes(row.member_id)
          && (!request.anonymousFilter || row.member.anonymized_at === null))
          .map(({ member_id, reason, details, member }) => ({ member_id, reason, details, member }))
        return Promise.resolve({ error: diagnosticError, data: selected, count: diagnosticCount === undefined ? selected.length : diagnosticCount }).then(resolve, reject)
      },
    }
    return query
  })
})

describe("read-only saved result review service", () => {
  it("uses a single authenticated administrator board capture for UI and export data", async () => {
    const result = await readSavedMatchingReview(sessionId, "current-revision")
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_get_matching_board", { p_session_id: sessionId, p_actor_admin_id: actor })
    expect(result.review.groups[0].members.map((person) => person.name)).toEqual(["Name 0", "Name 1"])
    expect(result.workbookData.submissions).toHaveLength(2)
    expect(result.workbookData.capturedAt).toBe(result.review.capturedAt)
    expect(result.workbookData.members.map((member) => member.member_identity.gender)).toEqual(["male", "female"])
    expect(result.workbookData.diagnostics).toEqual([])
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it("exposes only the safe review to ordinary administrators", async () => {
    mocks.admin.mockResolvedValue({ id: actor, role: "admin" })
    const result = await fetchSavedMatchingReview(sessionId)
    expect(result.groups[0]).toMatchObject({ recommendedSlot: "2026-11-04_下午", timeStatus: "hidden", commonSlots: [] })
    expect(JSON.stringify(result)).not.toContain("晚上")
    expect(JSON.stringify(result)).not.toContain("PRIVATE")
    expect(result).not.toHaveProperty("workbookData")
    expect(result.groups[0].members[0]).not.toHaveProperty("gender")
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it("does not let ordinary administrators obtain server-only workbook data", async () => {
    mocks.admin.mockResolvedValue({ id: actor, role: "admin" })
    await expect(readSavedMatchingReview(sessionId)).rejects.toThrow("仅超级管理员")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("rejects stale full-board revisions before producing any workbook", async () => {
    await expect(readSavedMatchingReview(sessionId, "old-revision")).rejects.toBeInstanceOf(MatchingReviewStaleError)
    expect(mocks.rpc).toHaveBeenCalledOnce()
  })
  it.each(["", "x".repeat(1001)])("rejects malformed expected revisions before querying", async (version) => {
    await expect(readSavedMatchingReview(sessionId, version)).rejects.toBeInstanceOf(MatchingReviewStaleError)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("never falls back to an old snapshot when the current capture is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "PRIVATE DATABASE DETAILS" } })
    await expect(readSavedMatchingReview(sessionId)).rejects.toThrow("暂时无法读取已保存")
  })
  it("never presents a fabricated empty table after incomplete source data", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...capture(), capture: { source: {} } }, error: null })
    await expect(fetchSavedMatchingReview(sessionId)).rejects.toThrow("无法完整读取")
  })

  it("reads only this session's currently unassigned diagnostics and checks the full revision again", async () => {
    mocks.rpc.mockResolvedValue({ data: unassignedCapture(), error: null })
    diagnostics = [diagnostic(waiting), diagnostic(unmatched), diagnostic(members[0]), diagnostic(unmatched, "another-session")]
    const result = await readSavedMatchingReview(sessionId, "current-revision")
    expect(result.workbookData.diagnostics).toEqual([waiting, unmatched].map((member_id) => ({ member_id, reason: "no_common_time", details: { version: "matching_diagnostic:1", code: "no_common_time" } })))
    expect(queryReads).toEqual([{ table: "unmatched_diagnostics", columns: "member_id, reason, details, member:members!inner(anonymized_at)", exactCount: true, session: sessionId, ids: [waiting, unmatched], anonymousFilter: true, order: "id" }])
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    expect(result.review).not.toHaveProperty("diagnostics")
    expect(JSON.stringify(result.review)).not.toContain("no_common_time")
    expect(JSON.stringify(result.workbookData.diagnostics)).not.toContain("PRIVATE")
  })

  it("retains multiple saved diagnostic records instead of silently choosing the last", async () => {
    mocks.rpc.mockResolvedValue({ data: unassignedCapture(), error: null })
    diagnostics = [diagnostic(unmatched), { ...diagnostic(unmatched), reason: "not_selected" }]
    expect((await readSavedMatchingReview(sessionId)).workbookData.diagnostics.map((row) => row.reason)).toEqual(["no_common_time", "not_selected"])
  })

  it("allows genuinely missing saved diagnostics without inventing a cause", async () => {
    mocks.rpc.mockResolvedValue({ data: unassignedCapture(), error: null })
    expect((await readSavedMatchingReview(sessionId)).workbookData.diagnostics).toEqual([])
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })

  it("fails a diagnostic read without falling back to an empty reason list", async () => {
    mocks.rpc.mockResolvedValue({ data: unassignedCapture(), error: null })
    diagnosticError = { message: "PRIVATE DATABASE DETAILS" }
    await expect(readSavedMatchingReview(sessionId)).rejects.toThrow("暂时无法读取已保存的未匹配原因")
    expect(mocks.rpc).toHaveBeenCalledOnce()
  })

  it.each([2, null, -1, 1.5])("rejects a truncated or unverifiable diagnostic count (%s)", async (count) => {
    mocks.rpc.mockResolvedValue({ data: unassignedCapture(), error: null })
    diagnostics = [diagnostic(unmatched)]; diagnosticCount = count
    await expect(readSavedMatchingReview(sessionId)).rejects.toThrow("无法完整读取已保存的未匹配原因")
    expect(mocks.rpc).toHaveBeenCalledOnce()
  })

  it.each(["edited diagnostics", "reassigned member", "erased member"])("rejects a %s race instead of combining different saved versions", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: unassignedCapture(), error: null })
      .mockResolvedValueOnce({ data: { ...unassignedCapture(), base_revision: "changed-version" }, error: null })
    diagnostics = [diagnostic(unmatched)]
    await expect(readSavedMatchingReview(sessionId)).rejects.toBeInstanceOf(MatchingReviewStaleError)
  })

  it("rejects a failed second capture even when the diagnostic query succeeded", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: unassignedCapture(), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
    await expect(readSavedMatchingReview(sessionId)).rejects.toThrow("暂时无法读取已保存的匹配结果")
  })

  it("does not query a captured erased member and independently excludes erased query relations", async () => {
    const data = unassignedCapture()
    Object.assign(data.capture.source.submissions[2].member, { anonymized_at: "2026-11-03T00:00:00Z" })
    mocks.rpc.mockResolvedValue({ data, error: null })
    diagnostics = [diagnostic(waiting), { ...diagnostic(unmatched), member: { anonymized_at: "2026-11-03T00:00:00Z" } }]
    const result = await readSavedMatchingReview(sessionId)
    expect(queryReads[0].ids).toEqual([unmatched])
    expect(result.workbookData.diagnostics).toEqual([])
    expect(result.workbookData.members.find((member) => member.id === waiting)?.member_identity.gender).toBeNull()
  })

  it("does not add diagnostic queries to a public review read", async () => {
    mocks.rpc.mockResolvedValue({ data: unassignedCapture(), error: null })
    const review = await fetchSavedMatchingReview(sessionId)
    expect(review.unmatched).toHaveLength(1)
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledOnce()
  })
})
