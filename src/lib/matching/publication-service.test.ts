import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MatchingEngineInput } from "./run-input"

const mocks = vi.hoisted(() => ({ db: vi.fn(), authenticatedDb: vi.fn(), prepare: vi.fn(), inspect: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.db }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.authenticatedDb }))
vi.mock("./publication-preflight", () => ({ preparePublicationPreflightInput: mocks.prepare, inspectPublicationPreflight: mocks.inspect }))
import { publishMatchingSession } from "./publication-service"
import { matchingReviewPublicationSignature } from "./session-review"

const input = { sessionId: "session-id", actorAdminId: "admin-id", reason: "核对后正式发布匹配", expectedPublicationVersion: 3 }
const receipt = { session_id: input.sessionId, round_id: "round-id", published: true, already_applied: false }
const captured = { source: "PRIVATE answers, identity and blacklists" }
const engine = { candidates: [], idMap: [], pairRelations: [], config: {}, algorithm_version: "max_coverage_split:2", adapter_version: 1 } as unknown as MatchingEngineInput
const rows = [{ id: "result", status: "draft", member_a_id: "a", member_b_id: "b", group_members: null, best_slot: "2026-10-25_下午", total_score: 74, score_breakdown: { frozen: true } }]
function fixture() {
  const prepare = vi.fn().mockResolvedValue({ data: { capture: captured, current_rows: rows, revision_token: "current-input-hash", round_id: "round-id" }, error: null })
  const authorize = vi.fn().mockResolvedValue({ data: { preflight_id: "server-proof" }, error: null })
  const publish = vi.fn().mockResolvedValue({ data: receipt, error: null })
  const board = vi.fn().mockResolvedValue({ data: { base_revision: "reviewed-board" }, error: null })
  const rpc = vi.fn(async (name, args) => {
    if (name === "admin_prepare_match_publication") return prepare(args)
    if (name === "admin_authorize_match_publication") return authorize(args)
    if (name === "admin_get_matching_board") return board(args)
    throw new Error(`Unexpected operation ${name}`)
  })
  mocks.db.mockReturnValue({ rpc })
  const authenticatedRpc = vi.fn(async (name, args) => {
    if (name === "admin_publish_checked_match_session") return publish(args)
    throw new Error(`Unexpected authenticated operation ${name}`)
  })
  mocks.authenticatedDb.mockResolvedValue({ rpc: authenticatedRpc })
  mocks.prepare.mockReturnValue(engine)
  mocks.inspect.mockReturnValue({ passed: true, issues: [] })
  return { prepare, authorize, publish, rpc, authenticatedRpc, board }
}
beforeEach(() => { vi.resetAllMocks() })

describe("final publication current-input preflight", () => {
  it("checks saved groups with current private input and calls only the atomic checked publish", async () => {
    const f = fixture()
    const original = structuredClone(rows)
    expect(await publishMatchingSession(input)).toEqual({ data: receipt })
    expect(f.prepare).toHaveBeenCalledExactlyOnceWith({ p_session_id: input.sessionId, p_actor_admin_id: input.actorAdminId, p_expected_publication_version: 3 })
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith(captured)
    expect(mocks.inspect).toHaveBeenCalledExactlyOnceWith(engine, rows)
    expect(f.authorize).toHaveBeenCalledExactlyOnceWith({ p_session_id: input.sessionId, p_actor_admin_id: input.actorAdminId, p_expected_publication_version: 3, p_revision_token: "current-input-hash" })
    expect(f.publish).toHaveBeenCalledExactlyOnceWith({ p_session_id: input.sessionId, p_expected_publication_version: 3,
      p_reason: input.reason, p_preflight_id: "server-proof" })
    expect(f.publish.mock.calls[0][0]).not.toHaveProperty("p_actor_admin_id")
    expect(f.publish.mock.calls[0][0]).not.toHaveProperty("p_engine")
    expect(f.publish.mock.calls[0][0]).not.toHaveProperty("p_rows")
    expect(f.publish.mock.calls[0][0]).not.toHaveProperty("p_score")
    expect(rows).toEqual(original)
    expect(f.rpc).not.toHaveBeenCalledWith("admin_publish_match_session", expect.anything())
  })
  it("returns safe reasons for withdrawal, hard conflicts and unavailable original time without a write", async () => {
    const f = fixture()
    mocks.inspect.mockReturnValue({ passed: false, issues: [
      { resultId: "a", code: "member_unavailable", message: "存在已撤销报名、资料不完整或当前不可参与的成员，请重新核对。" },
      { resultId: "b", code: "member_unavailable", message: "存在已撤销报名、资料不完整或当前不可参与的成员，请重新核对。" },
      { resultId: "c", code: "original_time_unavailable", message: "原推荐时间已不是全部成员共同可用的时间，请调整方案后再发布。" },
    ] })
    const result = await publishMatchingSession(input)
    expect(result).toEqual({ error: "存在已撤销报名、资料不完整或当前不可参与的成员，请重新核对；原推荐时间已不是全部成员共同可用的时间，请调整方案后再发布。" })
    expect(JSON.stringify(result)).not.toContain("PRIVATE")
    expect(f.publish).not.toHaveBeenCalled()
    expect(f.authorize).not.toHaveBeenCalled()
  })
  it("accepts an already-published version before current qualification can change the receipt", async () => {
    const f = fixture()
    f.prepare.mockResolvedValue({ data: { ...receipt, already_applied: true, capture: captured, current_rows: rows }, error: null })
    expect(await publishMatchingSession(input)).toEqual({ data: { ...receipt, already_applied: true } })
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.inspect).not.toHaveBeenCalled()
    expect(f.publish).not.toHaveBeenCalled()
  })
  it.each(["capture", "current_rows", "revision_token"])("fails closed when preparation omits %s", async (field) => {
    const f = fixture()
    const data: Record<string, unknown> = { capture: captured, current_rows: rows, revision_token: "revision" }
    delete data[field]
    f.prepare.mockResolvedValue({ data, error: null })
    if (field === "capture") mocks.prepare.mockImplementation(() => { throw new Error("PRIVATE malformed input") })
    expect(await publishMatchingSession(input)).toEqual({ error: expect.stringContaining("本次未发布") })
    expect(f.publish).not.toHaveBeenCalled()
  })
  it("never substitutes a newer browser version or retries a known stale rejection", async () => {
    const f = fixture()
    f.publish.mockResolvedValue({ data: null, error: { code: "PT409", message: "MATCH_PUBLICATION_STALE" } })
    expect(await publishMatchingSession(input)).toEqual({ error: "发布版本或审批状态已变化，请刷新并核对后重试；当前操作未生效" })
    expect(f.prepare).toHaveBeenCalledTimes(1)
    expect(f.publish).toHaveBeenCalledTimes(1)
  })
  it("stops a revision change between inspection and server authorization before using authenticated publish", async () => {
    const f = fixture()
    f.authorize.mockResolvedValue({ data: null, error: { code: "PT409", message: "MATCH_PUBLICATION_STALE" } })
    expect(await publishMatchingSession(input)).toEqual({ error: expect.stringContaining("发布版本或审批状态已变化") })
    expect(mocks.authenticatedDb).not.toHaveBeenCalled()
    expect(f.publish).not.toHaveBeenCalled()
  })
  it("requires an actual server authorization proof instead of treating an empty response as permission", async () => {
    const f = fixture()
    f.authorize.mockResolvedValue({ data: {}, error: null })
    expect(await publishMatchingSession(input)).toEqual({ error: expect.stringContaining("本次未发布") })
    expect(mocks.authenticatedDb).not.toHaveBeenCalled()
  })
  it("recognizes a concurrent same-version success during authorization without another publish", async () => {
    const f = fixture()
    f.authorize.mockResolvedValue({ data: { ...receipt, already_applied: true }, error: null })
    expect(await publishMatchingSession(input)).toEqual({ data: { ...receipt, already_applied: true } })
    expect(f.publish).not.toHaveBeenCalled()
    expect(mocks.authenticatedDb).not.toHaveBeenCalled()
  })
  it("keeps active-assignment conflicts and final atomic eligibility errors visible", async () => {
    const f = fixture()
    f.publish.mockResolvedValue({ data: null, error: { code: "PT409", message: "MATCH_PUBLICATION_CONFLICT" } })
    expect(await publishMatchingSession(input)).toEqual({ error: expect.stringContaining("其他已发布结果") })
    expect(f.publish).toHaveBeenCalledTimes(1)
  })
  it.each([
    ["MATCH_PUBLICATION_PREFLIGHT_REQUIRED", "须重新完成资格"],
    ["MATCH_PUBLICATION_PREFLIGHT_STALE", "复核后发生变化"],
    ["MATCH_PUBLICATION_PREFLIGHT_EXPIRED", "复核已过期"],
    ["MATCH_PUBLICATION_PREFLIGHT_INVALID", "复核记录无效"],
    ["MATCH_PUBLICATION_INELIGIBLE", "已撤销报名"],
    ["MATCH_PUBLICATION_ADJUSTMENT_BUSY", "正在处理的调整"],
    ["MATCH_PUBLICATION_GROUPS_PENDING", "分入正式小组或移至未匹配池"],
    ["MATCH_PUBLICATION_ORIGINAL_TIME_UNAVAILABLE", "原推荐时间"],
    ["MATCH_PUBLICATION_HARD_CONSTRAINT", "匹配硬约束"],
  ])("explains final database refusal %s without disclosing raw answers or retrying", async (message, expected) => {
    const f = fixture()
    f.publish.mockResolvedValue({ data: null, error: { code: "PT409", message } })
    const result = await publishMatchingSession(input)
    expect(result).toEqual({ error: expect.stringContaining(expected) })
    expect(JSON.stringify(result)).not.toContain("PRIVATE")
    expect(f.prepare).toHaveBeenCalledTimes(1)
    expect(f.publish).toHaveBeenCalledTimes(1)
  })
  it("reads the same-version receipt after a lost successful response instead of resending notifications", async () => {
    const f = fixture()
    f.publish.mockRejectedValue(new Error("network response lost"))
    f.prepare.mockResolvedValueOnce({ data: { capture: captured, current_rows: rows, revision_token: "revision" }, error: null })
      .mockResolvedValueOnce({ data: { ...receipt, already_applied: true }, error: null })
    expect(await publishMatchingSession(input)).toEqual({ data: { ...receipt, already_applied: true } })
    expect(f.publish).toHaveBeenCalledTimes(1)
    expect(f.prepare).toHaveBeenCalledTimes(2)
  })
  it("does not claim rollback or create a second write while the final receipt is unknown", async () => {
    const f = fixture()
    f.publish.mockResolvedValue({ data: null, error: { message: "network unavailable" } })
    f.prepare.mockResolvedValueOnce({ data: { capture: captured, current_rows: rows, revision_token: "revision" }, error: null })
      .mockRejectedValueOnce(new Error("still unavailable"))
    expect(await publishMatchingSession(input)).toEqual({ error: expect.stringContaining("无法确认发布结果"), unknown: true })
    expect(f.publish).toHaveBeenCalledTimes(1)
  })
  it("does not turn an unrelated later publication into a successful same-version receipt", async () => {
    const f = fixture()
    f.publish.mockRejectedValue(new Error("lost"))
    f.prepare.mockResolvedValueOnce({ data: { capture: captured, current_rows: rows, revision_token: "revision" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "MATCH_PUBLICATION_STALE" } })
    expect(await publishMatchingSession(input)).toEqual({ error: expect.stringContaining("无法确认发布结果"), unknown: true })
    expect(f.publish).toHaveBeenCalledTimes(1)
  })
  it("stops preparation errors without leaking raw source or running the match/scoring engine", async () => {
    const f = fixture()
    f.prepare.mockResolvedValue({ data: null, error: { code: "PT409", message: "MATCH_PUBLICATION_INCOMPLETE" } })
    expect(await publishMatchingSession(input)).toEqual({ error: "本次匹配尚未完整生成，请刷新并核对后再发布" })
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(f.publish).not.toHaveBeenCalled()
  })
})

describe("publication is bound to the saved result review", () => {
  const reviewCapture = { source: { submissions: ["a", "b"].map((member_id) => ({ member_id, availability: { "2026-10-25": ["下午", "晚上"] } })) } }
  const reviewedInput = () => ({ ...input, expectedReviewRevision: "reviewed-board",
    expectedReviewSignature: matchingReviewPublicationSignature(input.sessionId, rows, reviewCapture) })
  function reviewedFixture() {
    const f = fixture()
    f.prepare.mockResolvedValue({ data: { capture: structuredClone(reviewCapture), current_rows: structuredClone(rows), revision_token: "checked-publication-source" }, error: null })
    return f
  }
  it("compares both the full board revision and visible published fields before authorization", async () => {
    const f = reviewedFixture()
    expect(await publishMatchingSession(reviewedInput())).toEqual({ data: receipt })
    expect(f.board).toHaveBeenCalledExactlyOnceWith({ p_session_id: input.sessionId, p_actor_admin_id: input.actorAdminId })
    expect(f.authorize).toHaveBeenCalledWith(expect.objectContaining({ p_revision_token: "checked-publication-source" }))
    expect(f.publish).toHaveBeenCalledOnce()
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["admin_prepare_match_publication", "admin_get_matching_board", "admin_authorize_match_publication"])
  })
  it("blocks a changed waiting or unmatched layout even if all active groups are unchanged", async () => {
    const f = reviewedFixture()
    f.board.mockResolvedValue({ data: { base_revision: "waiting-layout-changed" }, error: null })
    expect(await publishMatchingSession(reviewedInput())).toEqual({ error: expect.stringContaining("重新读取发布前结果确认") })
    expect(f.authorize).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled()
  })
  it("binds the public message to the reviewed version before authorizing any publication", async () => {
    const f = reviewedFixture()
    f.prepare.mockResolvedValue({ data: { capture: reviewCapture, current_rows: rows, revision_token: "checked-publication-source", unmatched_message: "新留言" }, error: null })
    expect(await publishMatchingSession(reviewedInput())).toEqual({ error: expect.stringContaining("重新读取发布前结果确认") })
    expect(f.authorize).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled()
    const current = { ...reviewedInput(), expectedReviewSignature: matchingReviewPublicationSignature(input.sessionId, rows, reviewCapture, "新留言") }
    expect(await publishMatchingSession(current)).toEqual({ data: receipt })
  })
  it("binds personal overrides and suppression before authorizing publication", async () => {
    const f = reviewedFixture()
    const personal = { a: "个人说明甲", b: null }
    f.prepare.mockResolvedValue({ data: { capture: reviewCapture, current_rows: rows, revision_token: "checked-publication-source", unmatched_member_messages: personal }, error: null })
    expect(await publishMatchingSession(reviewedInput())).toEqual({ error: expect.stringContaining("重新读取发布前结果确认") })
    expect(f.authorize).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled()
    const current = { ...reviewedInput(), expectedReviewSignature: matchingReviewPublicationSignature(input.sessionId, rows, reviewCapture, null, undefined, personal) }
    expect(await publishMatchingSession(current)).toEqual({ data: receipt })
    f.authorize.mockClear(); f.publish.mockClear()
    f.prepare.mockResolvedValue({ data: { capture: reviewCapture, current_rows: rows, revision_token: "checked-publication-source", unmatched_member_messages: { a: "个人说明甲" } }, error: null })
    expect(await publishMatchingSession(current)).toEqual({ error: expect.stringContaining("重新读取发布前结果确认") })
    expect(f.authorize).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled()
  })
  it("blocks a changed current shared time even if a supplied board revision happens to match", async () => {
    const f = reviewedFixture(), changed = structuredClone(reviewCapture)
    changed.source.submissions[0].availability["2026-10-25"] = ["下午"]
    f.prepare.mockResolvedValue({ data: { capture: changed, current_rows: rows, revision_token: "checked-publication-source" }, error: null })
    expect(await publishMatchingSession(reviewedInput())).toEqual({ error: expect.stringContaining("共同时间已变化") })
    expect(f.authorize).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled()
  })
  it("blocks changed membership before authorizing a publish", async () => {
    const f = reviewedFixture()
    f.prepare.mockResolvedValue({ data: { capture: reviewCapture, current_rows: [{ ...rows[0], member_b_id: "c" }], revision_token: "checked-publication-source" }, error: null })
    expect(await publishMatchingSession(reviewedInput())).toEqual({ error: expect.stringContaining("已保存方案") })
    expect(f.authorize).not.toHaveBeenCalled()
  })
  it("preserves the receipt-first retry when the reviewed version has already published", async () => {
    const f = reviewedFixture()
    f.prepare.mockResolvedValue({ data: { ...receipt, already_applied: true }, error: null })
    expect(await publishMatchingSession(reviewedInput())).toEqual({ data: { ...receipt, already_applied: true } })
    expect(f.board).not.toHaveBeenCalled(); expect(f.authorize).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled()
  })
  it.each([
    { expectedReviewRevision: "reviewed-board" },
    { expectedReviewSignature: "a".repeat(64) },
    { expectedReviewRevision: "", expectedReviewSignature: "a".repeat(64) },
    { expectedReviewRevision: "reviewed-board", expectedReviewSignature: "invalid" },
  ])("requires a valid pair of review tokens: %j", async (tokens) => {
    const f = fixture()
    expect(await publishMatchingSession({ ...input, ...tokens })).toEqual({ error: expect.stringContaining("核对版本无效") })
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled()
  })
  it("does not authorize when the fresh board cannot be read", async () => {
    const f = reviewedFixture(); f.board.mockResolvedValue({ data: null, error: { message: "PRIVATE DB" } })
    expect(await publishMatchingSession(reviewedInput())).toEqual({ error: expect.stringContaining("本次未发布") })
    expect(f.authorize).not.toHaveBeenCalled()
  })
  it("still uses the original proof check to reject a race after review validation", async () => {
    const f = reviewedFixture(); f.authorize.mockResolvedValue({ data: null, error: { code: "PT409", message: "MATCH_PUBLICATION_PREFLIGHT_STALE" } })
    expect(await publishMatchingSession(reviewedInput())).toEqual({ error: expect.stringContaining("复核后发生变化") })
    expect(f.publish).not.toHaveBeenCalled()
  })
})
