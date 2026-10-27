import { beforeEach, describe, expect, it, vi } from "vitest"
import { createScoringV3Config } from "./scoring-policy"
import { inspectManualAdjustment } from "./adjustment-engine"
import { pairKey } from "./pair-history"
import type { MatchingEngineInput } from "./run-input"
import type { BoardDraft, BoardSourceRow } from "./board-types"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), db: vi.fn(), invalidate: vi.fn(), prepare: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.db }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.invalidate }))
vi.mock("./run-input", async (original) => ({ ...await original<typeof import("./run-input")>(), prepareMatchingRunInput: mocks.prepare }))
import { boardRequestHash, fetchMatchingBoard, inspectMatchingBoardGroup, inspectMatchingBoardGroupMove, inspectMatchingBoardPair, inspectMatchingBoardMultiMove, rematchMatchingBoard, saveMatchingBoard, setMatchingBoardMemberLock } from "./board-service"

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const sessionId = id(100), operationId = id(101), actorId = id(102), reason = "根据已确认的可用时间调整匹配"
function engine(n = 4): MatchingEngineInput {
  return { algorithm_version: "max_coverage_split:3", adapter_version: 2, pairRelations: [], idMap: Array.from({ length: n }, (_, i) => [id(i + 1), id(i + 1)]),
    config: createScoringV3Config({ version: "weighted_feedback:1", quizVersionId: "quiz", dimensionWeights: { E: .3, A: .3, O: .15, C: .1, N: .15 }, activityFeedback: [] }),
    candidates: Array.from({ length: n }, (_, i) => ({ submissionId: id(i + 1), name: `member ${i + 1}`, gameTypePref: "都可以", genderPref: "都可以", availability: { "2026-10-31": ["下午"] }, formInterestTags: [], formSocialStyle: null, gender: "女", school: null, interestTags: [], socialTags: [], level: 1, compatibilityScore: 4, matchHistory: [], gameMode: null, hasProfile: true })) }
}
function setup(input = engine(), rows: BoardSourceRow[] = []) {
  const occupied = new Set(rows.flatMap((row) => row.group_members?.length ? row.group_members : [row.member_a_id, row.member_b_id!]))
  const draft: BoardDraft = { duos: rows.filter((row) => !row.group_members?.length).map((row) => ({ key: row.id, resultId: row.id, memberIds: [row.member_a_id, row.member_b_id!], bestSlot: row.best_slot })), multi: null, waitingDuoIds: [], brokenPairs: [], unmatchedIds: input.idMap.map(([, memberId]) => memberId).filter((memberId) => !occupied.has(memberId)) }
  const request = { sessionId, draft, expectedRevision: "current", operationId, reason }
  const read = vi.fn().mockResolvedValue({ data: { base_revision: "current", capture: { secret: "private raw feedback" }, results: rows, layout: null, cohort_member_ids: input.idMap.map(([, memberId]) => memberId), round_id: id(110), session_status: "draft" }, error: null })
  const get = vi.fn().mockResolvedValue({ data: null, error: null })
  const save = vi.fn().mockImplementation(async (args: { p_request_hash: string }) => ({ data: { session_id: sessionId, operation_id: operationId, request_hash: args.p_request_hash, base_revision: "saved", result_ids: [], already_applied: false }, error: null }))
  const lockGet = vi.fn().mockResolvedValue({ data: null, error: null })
  const lockSet = vi.fn().mockImplementation(async (args: Record<string, unknown>) => ({ data: { session_id: args.p_session_id, operation_id: args.p_operation_id, member_id: args.p_member_id, locked: args.p_locked, expected_revision: args.p_expected_revision, base_revision: "locked-revision", already_applied: false }, error: null }))
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "admin_get_matching_board") return read(args)
    if (name === "admin_get_matching_board_operation") return get(args)
    if (name === "admin_save_matching_board") return save(args)
    if (name === "admin_get_matching_board_member_lock_operation") return lockGet(args)
    if (name === "admin_set_matching_board_member_lock") return lockSet(args)
    throw new Error(name)
  })
  mocks.db.mockReturnValue({ rpc }); mocks.prepare.mockReturnValue({ engineInput: input })
  return { input, request, read, get, save, rpc, lockGet, lockSet }
}
beforeEach(() => { vi.resetAllMocks(); mocks.admin.mockResolvedValue({ id: actorId, role: "super_admin" }) })

describe("board service authorization, capture and save boundary", () => {
  it("can read confirmed snapshots but rejects every preview and save on them", async () => {
    const f = setup()
    const value = await f.read()
    f.read.mockResolvedValue({ ...value, data: { ...value.data, session_status: "confirmed" } })
    expect((await fetchMatchingBoard(sessionId)).cohortMemberIds).toHaveLength(4)
    expect(await rematchMatchingBoard(f.request)).toMatchObject({ error: expect.stringContaining("不能编辑") })
    expect(await saveMatchingBoard(f.request)).toMatchObject({ error: expect.stringContaining("不能编辑") })
    expect(f.save).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it("exposes only count/date metadata from board operation history", async () => {
    const f = setup(), value = await f.read()
    f.read.mockResolvedValue({ ...value, data: { ...value.data, operations: [{ id: operationId, created_at: "2026-10-26T00:00:00Z", member_count: 4, result_count: 2, reason: "private reason", actor_admin_id: "private actor", payload: "raw private draft" }] } })
    const result = await fetchMatchingBoard(sessionId)
    expect(result.operations).toEqual([{ id: operationId, created_at: "2026-10-26T00:00:00Z", member_count: 4, result_count: 2 }])
    expect(JSON.stringify(result)).not.toContain("private")
  })
  it("projects current captured round answers only for super admins and only for this cohort", async () => {
    const f = setup(), value = await f.read()
    const current = { member_id: id(1), game_type_pref: "多人", gender_pref: "男", availability: { "2026-11-02": ["晚上"] }, interest_tags: ["推理"], social_style: "慢热", member: { private_history: "PRIVATE-MEMBER" }, message: "PRIVATE-NOTE", import_metadata: { private: true } }
    f.read.mockResolvedValue({ ...value, data: { ...value.data, capture: { source: { submissions: [current, { ...current, member_id: id(999) }], blacklist: "PRIVATE-BLACKLIST", feedbacks: "PRIVATE-FEEDBACK", scoring_policy: "PRIVATE-SCORING" } } } })
    const result = await fetchMatchingBoard(sessionId)
    expect(result.currentSubmissionPrefs).toEqual({ [id(1)]: { game_type_pref: "多人", gender_pref: "男", availability: { "2026-11-02": ["晚上"] }, interest_tags: ["推理"], social_style: "慢热" } })
    expect(JSON.stringify(result)).not.toContain("PRIVATE-")
    mocks.admin.mockResolvedValue({ id: actorId, role: "admin" })
    const ordinary = await fetchMatchingBoard(sessionId)
    expect(ordinary).not.toHaveProperty("currentSubmissionPrefs")
    expect(JSON.stringify(ordinary)).not.toContain("2026-11-02")
    expect(JSON.stringify(ordinary)).not.toContain("PRIVATE-")
  })
  it("previews on the server and never writes, returning only safe output fields", async () => {
    const f = setup()
    const result = await inspectMatchingBoardPair({ ...f.request, memberIds: [id(1), id(2)] })
    expect(result).toMatchObject({ success: true, passed: true, revisionToken: "current" })
    expect(result.draft?.duos[0].memberIds).toEqual([id(1), id(2)])
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["admin_get_matching_board"])
    expect(JSON.stringify(result)).not.toContain("private raw feedback")
    expect(result).not.toHaveProperty("engine")
  })
  it("rejects stale previews before running the engine and rejects stale saves before mutation", async () => {
    const f = setup(), request = { ...f.request, expectedRevision: "stale" }
    expect(await rematchMatchingBoard(request)).toMatchObject({ error: expect.stringContaining("已变化") })
    expect(await saveMatchingBoard(request)).toMatchObject({ error: expect.stringContaining("已变化") })
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled()
  })
  it("redacts source-only SQL columns and private score components for ordinary admins", async () => {
    const input = engine(), original: BoardSourceRow = { ...inspectManualAdjustment(input, [id(1), id(2)]).rows[0], id: id(120), status: "draft" }
    Object.assign(original, { audit_reason: "DO-NOT-EXPOSE", locked_by: "PRIVATE-ACTOR" })
    setup(input, [original]); mocks.admin.mockResolvedValue({ id: actorId, role: "admin" })
    const result = await fetchMatchingBoard(sessionId)
    expect(result.rows[0].score_breakdown).toBeNull(); expect(result.cohortMemberIds).toHaveLength(4)
    expect(JSON.stringify(result)).not.toContain("DO-NOT-EXPOSE"); expect(JSON.stringify(result)).not.toContain("PRIVATE-ACTOR")
    expect(JSON.stringify(result)).not.toContain("private raw feedback")
  })
  it("does not disclose blacklist history in an ordinary-admin rejected pair preview", async () => {
    const input = engine(); input.pairRelations.push([pairKey(id(1), id(2)), { playerA: id(1), playerB: id(2), status: "blacklist", totalPairCount: 1, hasMutualFive: false, reason: "PRIVATE-REVIEWER" }])
    const f = setup(input); mocks.admin.mockResolvedValue({ id: actorId, role: "admin" })
    const result = await inspectMatchingBoardPair({ ...f.request, memberIds: [id(1), id(2)] })
    expect(result.passed).toBe(false); expect(JSON.stringify(result)).not.toContain("PRIVATE-REVIEWER")
    expect(JSON.stringify(result)).not.toContain("黑名单")
  })
  it("recomputes new scores and submits one atomic save including unchanged result IDs", async () => {
    const input = engine(), old = { ...inspectManualAdjustment(input, [id(1), id(2)]).rows[0], id: id(120), status: "draft", total_score: 456.789 }
    const f = setup(input, [old]); f.request.draft.duos.push({ key: "new", memberIds: [id(3), id(4)], bestSlot: "client-supplied" }); f.request.draft.unmatchedIds = []
    Object.assign(f.request.draft.duos[1], { total_score: 999999 })
    expect(await saveMatchingBoard(f.request)).toMatchObject({ success: true, operationId })
    expect(f.save).toHaveBeenCalledOnce()
    const payload = f.save.mock.calls[0][0]
    expect(payload.p_keep_result_ids).toEqual([id(120)]); expect(payload.p_rows).toHaveLength(1)
    expect(payload.p_rows[0].total_score).not.toBe(999999); expect(payload.p_rows[0].best_slot).toBe("2026-10-31_下午")
    expect(payload.p_unmatched_ids).toEqual([])
  })
  it("resolves a committed lost response using the same operation receipt", async () => {
    const f = setup(), saved = { session_id: sessionId, operation_id: operationId, request_hash: boardRequestHash(f.request, reason), base_revision: "saved", result_ids: [], already_applied: true }
    f.save.mockRejectedValue(new Error("connection lost")); f.get.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: saved, error: null })
    expect(await saveMatchingBoard(f.request)).toMatchObject({ success: true, operationId })
    expect(f.save).toHaveBeenCalledOnce()
  })
  it("resolves successful retries before recapturing a now-stale revision", async () => {
    const f = setup(); f.get.mockResolvedValue({ data: { session_id: sessionId, operation_id: operationId, request_hash: boardRequestHash(f.request, reason), base_revision: "saved", result_ids: [], already_applied: true }, error: null })
    expect(await saveMatchingBoard(f.request)).toMatchObject({ success: true, operationId })
    expect(f.read).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled()
  })
  it("rejects reuse of a successful operation for a different request", async () => {
    const f = setup(); f.get.mockResolvedValue({ data: { session_id: sessionId, operation_id: operationId, request_hash: "different", base_revision: "saved", result_ids: [], already_applied: true }, error: null })
    expect(await saveMatchingBoard(f.request)).toMatchObject({ error: expect.stringContaining("其他调整") })
    expect(f.read).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled()
  })
  it("explains an obsolete pre-grouping client save without exposing raw database details", async () => {
    const f = setup(); f.save.mockResolvedValue({ data: null, error: { code: "PT409", message: "MATCH_BOARD_GROUPED_REQUIRED:PRIVATE-DETAIL" } })
    const result = await saveMatchingBoard(f.request)
    expect(result).toMatchObject({ operationId, error: expect.stringContaining("页面版本已过期") })
    expect(result.unknown).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain("PRIVATE-DETAIL")
  })
  it("retains the original operation ID when the save outcome is unknown", async () => {
    const f = setup(); f.save.mockRejectedValue(new Error("connection lost"))
    expect(await saveMatchingBoard(f.request)).toMatchObject({ unknown: true, operationId, error: expect.stringContaining("原操作编号") })
  })
  it("does not silently remove an ineligible member from the captured cohort", async () => {
    const f = setup(); f.input.candidates.pop(); f.request.draft.duos.push({ key: "new", memberIds: [id(3), id(4)], bestSlot: null }); f.request.draft.unmatchedIds = [id(1), id(2)]
    expect(await saveMatchingBoard(f.request)).toMatchObject({ error: expect.stringContaining("有效候选") })
    expect(f.save).not.toHaveBeenCalled()
  })
})


describe("individual member lock service", () => {
  const lockRequest = { sessionId, memberId: id(1), locked: true, expectedRevision: "current", operationId }
  function paired() {
    const input = engine(), row = { ...inspectManualAdjustment(input, [id(1), id(2)]).rows[0], id: id(120), status: "draft" }
    return setup(input, [row])
  }
  const lockReceipt = () => ({ session_id: sessionId, operation_id: operationId, member_id: id(1), locked: true, expected_revision: "current", base_revision: "locked-revision", already_applied: true })
  it("provides compatible empty defaults until the new capture fields are deployed", async () => {
    setup()
    expect(await fetchMatchingBoard(sessionId)).toMatchObject({ lockedMemberIds: [], memberLockOperations: [] })
  })
  it("projects only safe lock history fields for ordinary admins", async () => {
    const f = paired(), value = await f.read()
    f.read.mockResolvedValue({ ...value, data: { ...value.data, locked_member_ids: [id(1), id(999)], member_lock_operations: [{ id: operationId, created_at: "2026-10-26T01:00:00Z", locked: true, member_id: id(1), actor_admin_id: "PRIVATE-ACTOR", reason: "PRIVATE-REASON", payload: "PRIVATE-CAPTURE" }] } })
    mocks.admin.mockResolvedValue({ id: actorId, role: "admin" })
    const result = await fetchMatchingBoard(sessionId)
    expect(result.lockedMemberIds).toEqual([id(1)])
    expect(result.memberLockOperations).toEqual([{ id: operationId, created_at: "2026-10-26T01:00:00Z", locked: true }])
    expect(JSON.stringify(result)).not.toContain("PRIVATE-")
  })
  it("never accepts client lock removal to bypass preview, rematch or save guards", async () => {
    const f = paired(), value = await f.read()
    f.read.mockResolvedValue({ ...value, data: { ...value.data, locked_member_ids: [id(1)] } })
    f.request.draft.duos = []; f.request.draft.unmatchedIds.push(id(1), id(2))
    Object.assign(f.request.draft, { lockedMemberIds: [] })
    expect(await inspectMatchingBoardPair({ ...f.request, memberIds: [id(1), id(3)] })).toMatchObject({ error: expect.stringContaining("已锁定") })
    expect(await inspectMatchingBoardMultiMove({ ...f.request, memberId: id(2) })).toMatchObject({ error: expect.stringContaining("已锁定") })
    expect(await rematchMatchingBoard(f.request)).toMatchObject({ error: expect.stringContaining("已锁定") })
    expect(await saveMatchingBoard(f.request)).toMatchObject({ error: expect.stringContaining("已锁定") })
    expect(f.save).not.toHaveBeenCalled()
  })
  it("uses authoritative original waiting layout when enforcing personal locks", async () => {
    const f = setup(), value = await f.read()
    f.read.mockResolvedValue({ ...value, data: { ...value.data, locked_member_ids: [id(1)], layout: { waitingDuoIds: [id(1)], brokenPairs: [] } } })
    expect(await rematchMatchingBoard(f.request)).toMatchObject({ error: expect.stringContaining("已锁定") })
    f.request.draft.waitingDuoIds = [id(1)]; f.request.draft.unmatchedIds = [id(2), id(3), id(4)]
    expect(await rematchMatchingBoard(f.request)).toMatchObject({ success: true })
  })
  it("sets the requested target without requiring a user-written reason", async () => {
    const f = paired()
    expect(await setMatchingBoardMemberLock(lockRequest)).toEqual({ success: true, operationId, revisionToken: "locked-revision" })
    expect(f.lockSet).toHaveBeenCalledWith({ p_session_id: sessionId, p_actor_admin_id: actorId, p_member_id: id(1), p_locked: true, p_operation_id: operationId, p_expected_revision: "current" })
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it("can lock a saved waiting member without pairing them", async () => {
    const f = setup(), value = await f.read()
    f.read.mockResolvedValue({ ...value, data: { ...value.data, layout: { waitingDuoIds: [id(1)], brokenPairs: [] } } })
    expect(await setMatchingBoardMemberLock(lockRequest)).toMatchObject({ success: true })
  })
  it("does not lock unsaved placements or unmatched members", async () => {
    const f = setup()
    expect(await setMatchingBoardMemberLock(lockRequest)).toMatchObject({ error: expect.stringContaining("双人池") })
    expect(f.lockSet).not.toHaveBeenCalled()
  })
  it("rejects stale and non-editable sessions before mutation", async () => {
    const f = paired()
    expect(await setMatchingBoardMemberLock({ ...lockRequest, expectedRevision: "old" })).toMatchObject({ error: expect.stringContaining("已变化") })
    const value = await f.read(); f.read.mockResolvedValue({ ...value, data: { ...value.data, session_status: "confirmed" } })
    expect(await setMatchingBoardMemberLock(lockRequest)).toMatchObject({ error: expect.stringContaining("不能编辑") })
    expect(f.lockSet).not.toHaveBeenCalled()
  })
  it("resolves a lost committed response by operation receipt", async () => {
    const f = paired()
    f.lockSet.mockRejectedValue(new Error("connection lost"))
    f.lockGet.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: lockReceipt(), error: null })
    expect(await setMatchingBoardMemberLock(lockRequest)).toMatchObject({ success: true, operationId, revisionToken: "locked-revision" })
    expect(f.lockSet).toHaveBeenCalledOnce()
  })
  it("resolves successful retries before checking the now-stale revision", async () => {
    const f = paired(); f.lockGet.mockResolvedValue({ data: lockReceipt(), error: null })
    expect(await setMatchingBoardMemberLock(lockRequest)).toMatchObject({ success: true, operationId })
    expect(f.read).not.toHaveBeenCalled(); expect(f.lockSet).not.toHaveBeenCalled()
  })
  it.each(["memberId", "locked", "expectedRevision"] as const)("rejects a retry with different %s", async (field) => {
    const f = paired(); f.lockGet.mockResolvedValue({ data: lockReceipt(), error: null })
    const changed = { ...lockRequest, [field]: field === "locked" ? false : field === "memberId" ? id(2) : "other" }
    expect(await setMatchingBoardMemberLock(changed)).toMatchObject({ error: expect.stringContaining("其他调整"), operationId })
    expect(f.lockSet).not.toHaveBeenCalled()
  })
  it("keeps the original operation ID on an unknown result and does not infer an unlocked state", async () => {
    const f = paired(); f.lockSet.mockRejectedValue(new Error("connection lost"))
    expect(await setMatchingBoardMemberLock(lockRequest)).toMatchObject({ unknown: true, operationId, error: expect.stringContaining("原操作编号") })
    expect(f.lockSet).toHaveBeenCalledOnce()
  })
  it("reports definite database rejection without exposing raw error detail", async () => {
    const f = paired(); f.lockSet.mockResolvedValue({ data: null, error: { message: "MATCH_BOARD_MEMBER_LOCK_REVISION PRIVATE-DETAIL", code: "PT409" } })
    const result = await setMatchingBoardMemberLock(lockRequest)
    expect(result).toMatchObject({ error: expect.stringContaining("已变化"), operationId })
    expect(result.unknown).toBeUndefined(); expect(JSON.stringify(result)).not.toContain("PRIVATE-DETAIL")
  })
})


describe("formal multiplayer group service boundary", () => {
  function pool(n = 7) {
    const input = engine(n)
    input.candidates.forEach((member) => { member.availability["2026-10-31"] = ["下午", "晚上"] })
    const row = { ...inspectManualAdjustment(input, input.candidates.map((member) => member.submissionId)).rows[0], id: id(130), status: "draft" }
    const f = setup(input, [row])
    f.request.draft.multi = { key: row.id, resultId: row.id, memberIds: [...row.group_members!], bestSlot: row.best_slot }
    return f
  }
  it("previews an explicit group without writing and rejects stale or published requests", async () => {
    const f = pool()
    const input = { ...f.request, memberIds: [id(1), id(2), id(3)], slot: "2026-10-31_晚上" }
    const result = await inspectMatchingBoardGroup(input)
    expect(result).toMatchObject({ success: true, passed: true, draft: { multiMode: "grouped", multiGroups: [{ memberIds: input.memberIds, bestSlot: input.slot }] } })
    expect(f.save).not.toHaveBeenCalled()
    expect(await inspectMatchingBoardGroup({ ...input, expectedRevision: "old" })).toMatchObject({ error: expect.stringContaining("已变化") })
    const value = await f.read(); f.read.mockResolvedValue({ ...value, data: { ...value.data, session_status: "confirmed" } })
    expect(await inspectMatchingBoardGroup(input)).toMatchObject({ error: expect.stringContaining("不能编辑") })
    expect(f.save).not.toHaveBeenCalled()
  })
  it("sends only validated groups as result rows and persists the one-person waiting pool in layout", async () => {
    const f = pool()
    const first = await inspectMatchingBoardGroup({ ...f.request, memberIds: [id(1), id(2), id(3)], slot: "2026-10-31_晚上" })
    const second = await inspectMatchingBoardGroup({ ...f.request, draft: first.draft!, memberIds: [id(4), id(5), id(6)], slot: "2026-10-31_下午" })
    expect(await saveMatchingBoard({ ...f.request, draft: second.draft! })).toMatchObject({ success: true })
    const saved = f.save.mock.calls[0][0]
    expect(saved.p_keep_result_ids).toEqual([])
    expect(saved.p_rows.map((row: BoardSourceRow) => row.group_members)).toEqual([[id(1), id(2), id(3)], [id(4), id(5), id(6)]])
    expect(saved.p_layout).toEqual({ waitingDuoIds: [], brokenPairs: [], multiMode: "grouped", waitingMultiIds: [id(7)], multiPoolSlot: "2026-10-31_下午" })
    expect(saved.p_unmatched_ids).toEqual([id(7)])
    expect(saved.p_request_hash).not.toBe(boardRequestHash(f.request, reason))
  })
  it("validates group moves and blocks incomplete groups before a database save", async () => {
    const f = pool(6)
    const first = await inspectMatchingBoardGroup({ ...f.request, memberIds: [id(1), id(2), id(3)], slot: "2026-10-31_下午" })
    const second = await inspectMatchingBoardGroup({ ...f.request, draft: first.draft!, memberIds: [id(4), id(5), id(6)], slot: "2026-10-31_下午" })
    const moved = await inspectMatchingBoardGroupMove({ ...f.request, draft: second.draft!, memberId: id(3), groupKey: second.draft!.multiGroups![1].key })
    expect(moved).toMatchObject({ passed: true })
    expect(await saveMatchingBoard({ ...f.request, draft: moved.draft! })).toMatchObject({ error: expect.stringContaining("至少需要3人") })
    expect(f.save).not.toHaveBeenCalled()
  })
  it("redacts raw group constraints for ordinary admins and rejects malformed request fields", async () => {
    const f = pool()
    f.input.pairRelations.push([pairKey(id(2), id(3)), { playerA: id(2), playerB: id(3), status: "blacklist", totalPairCount: 1, hasMutualFive: false, reason: "PRIVATE-RELATION" }])
    mocks.admin.mockResolvedValue({ id: actorId, role: "admin" })
    const result = await inspectMatchingBoardGroup({ ...f.request, memberIds: [id(1), id(2), id(3)], slot: "2026-10-31_下午" })
    expect(result.passed).toBe(false)
    expect(JSON.stringify(result)).not.toContain("黑名单")
    expect(JSON.stringify(result)).not.toContain("PRIVATE-")
    expect(await inspectMatchingBoardGroup({ ...f.request, memberIds: [id(1)], slot: "" })).toMatchObject({ error: expect.any(String) })
    expect(await inspectMatchingBoardGroupMove({ ...f.request, memberId: id(1), groupKey: "" })).toMatchObject({ error: expect.any(String) })
    expect(f.save).not.toHaveBeenCalled()
  })
})
