import { describe, expect, it } from "vitest"
import { createBoardDraft, evaluateBoard, previewBoardMultiMove, previewBoardPair, rematchBoardDraft, validateBoardStructure, type BoardContext } from "./board-engine"
import { inspectManualAdjustment } from "./adjustment-engine"
import { pairKey } from "./pair-history"
import type { BoardDraft, BoardSourceRow } from "./board-types"
import { createScoringV3Config } from "./scoring-policy"
import type { MatchCandidate } from "./types"

function candidate(id: string, extra: Partial<MatchCandidate> = {}): MatchCandidate {
  return { submissionId: id, name: id, gameTypePref: "都可以", genderPref: "都可以", availability: { "2026-10-31": ["下午", "晚上"] },
    formInterestTags: [], formSocialStyle: null, gender: "女", school: "甲大学", interestTags: [], socialTags: [], level: 1,
    compatibilityScore: 4, matchHistory: [], gameMode: null, hasProfile: true, ...extra }
}
function context(count = 6): BoardContext {
  const candidates = Array.from({ length: count }, (_, i) => candidate(String(i + 1)))
  return { cohortMemberIds: candidates.map((c) => c.submissionId), originalRows: [], engine: {
    candidates, idMap: candidates.map((c) => [c.submissionId, c.submissionId]), pairRelations: [], algorithm_version: "max_coverage_split:3", adapter_version: 2,
    config: createScoringV3Config({ version: "weighted_feedback:1", quizVersionId: "quiz", dimensionWeights: { E: .3, A: .3, O: .15, C: .1, N: .15 }, activityFeedback: [] }),
  } }
}
function original(ctx: BoardContext, ids: string[], id: string, locked = false): BoardSourceRow {
  const row = { ...inspectManualAdjustment(ctx.engine, ids).rows[0], id, status: locked ? "locked" : "draft" }
  ctx.originalRows.push(row)
  return row
}
const draft = (ctx: BoardContext) => createBoardDraft(ctx.originalRows, ctx.cohortMemberIds)

describe("three-pool draft invariants", () => {
  it("retains unchanged result IDs, slots and historical scores verbatim", () => {
    const ctx = context(); const row = original(ctx, ["1", "2"], "old-duo"); row.total_score = 123.456; row.score_breakdown = { historical: true }
    const result = evaluateBoard(ctx, draft(ctx), true)
    expect(result.keepResultIds).toEqual(["old-duo"]); expect(result.changedRows).toEqual([])
    expect(result.rows[0]).toMatchObject({ total_score: 123.456, score_breakdown: { historical: true }, resultId: "old-duo" })
  })
  it("checks the original slot and hard constraints again without recomputing a kept score", () => {
    const ctx = context(3); original(ctx, ["1", "2"], "duo")
    ctx.engine.candidates[1].availability = { "2026-11-01": ["下午"] }
    expect(() => evaluateBoard(ctx, draft(ctx), true)).toThrow("推荐时间")
    ctx.engine.candidates[1].availability = { "2026-10-31": ["下午"] }
    ctx.engine.pairRelations.push([pairKey("1", "2"), { playerA: "1", playerB: "2", status: "blacklist", totalPairCount: 1, hasMutualFive: false, reason: "current exclusion" }])
    expect(() => evaluateBoard(ctx, draft(ctx), true)).toThrow("黑名单")
  })
  it("rejects duplicates, missing members and injected members even in a preview", () => {
    const ctx = context(3), input = draft(ctx)
    expect(() => validateBoardStructure(ctx, { ...input, waitingDuoIds: ["1"] })).toThrow("同一人员")
    expect(() => validateBoardStructure(ctx, { ...input, unmatchedIds: ["1", "2"] })).toThrow("名单")
    expect(() => validateBoardStructure(ctx, { ...input, unmatchedIds: ["1", "2", "outside"] })).toThrow("名单")
  })
  it("treats grey lines as references to waiting members and clears them after one member leaves", () => {
    const ctx = context(4), input = draft(ctx)
    input.waitingDuoIds = ["1", "2"]; input.unmatchedIds = ["3", "4"]; input.brokenPairs = [{ key: "grey", memberIds: ["1", "2"] }]
    const moved = previewBoardMultiMove(ctx, input, "1")
    expect(moved.draft.waitingDuoIds).toEqual(["2"]); expect(moved.draft.brokenPairs).toEqual([])
    expect(moved.draft.multi?.memberIds).toEqual(["1"])
    expect(() => evaluateBoard(ctx, moved.draft, true)).toThrow("至少需要3人")
  })
  it("keeps one/two-member partial pools editable but never silently saves them as a duo", () => {
    const ctx = context(4); original(ctx, ["1", "2", "3"], "pool")
    const input = draft(ctx); input.multi!.memberIds = ["1", "2"]; input.unmatchedIds.push("3")
    expect(evaluateBoard(ctx, input).draft.multi?.memberIds).toEqual(["1", "2"])
    expect(() => evaluateBoard(ctx, input, true)).toThrow("至少需要3人")
  })
  it("blocks every edit of a locked result including a disguised new result ID", () => {
    const ctx = context(4); original(ctx, ["1", "2"], "locked", true)
    const input = draft(ctx); input.duos = []; input.unmatchedIds.push("1", "2")
    expect(() => evaluateBoard(ctx, input)).toThrow("已锁定")
  })
  it("cannot pair someone who still has a partner and uses existing hard constraints", () => {
    const ctx = context(4); original(ctx, ["1", "2"], "duo")
    expect(() => previewBoardPair(ctx, draft(ctx), ["1", "3"])).toThrow("先取消")
    ctx.engine.candidates[2].gameTypePref = "多人"
    expect(previewBoardPair(ctx, draft(ctx), ["3", "4"])).toMatchObject({ passed: false })
  })
})

describe("fixed multiplayer time and complete-group constraints", () => {
  it("moves incompatible newcomers to unmatched without changing the existing pool", () => {
    const ctx = context(5); original(ctx, ["1", "2", "3"], "pool")
    ctx.engine.candidates[3].availability = { "2026-10-31": ["晚上"] }
    const input = draft(ctx), result = previewBoardMultiMove(ctx, input, "4")
    expect(result.passed).toBe(false); expect(result.draft.multi).toEqual(input.multi)
    expect(result.draft.unmatchedIds).toContain("4")
    expect(ctx.originalRows[0].best_slot).toBe("2026-10-31_下午")
  })
  it.each(["blacklist", "cooldown"] as const)("enforces %s between a newcomer and every member", (status) => {
    const ctx = context(4); original(ctx, ["1", "2", "3"], "pool")
    ctx.engine.pairRelations.push([pairKey("3", "4"), { playerA: "3", playerB: "4", status, totalPairCount: 1, hasMutualFive: false, reason: "private" }])
    const result = previewBoardMultiMove(ctx, draft(ctx), "4")
    expect(result.passed).toBe(false); expect(result.draft.multi?.memberIds).toEqual(["1", "2", "3"])
  })
  it("accepts qualifying newcomers at the original time and rescales only the changed pool", () => {
    const ctx = context(6); const pool = original(ctx, ["1", "2", "3"], "pool"); original(ctx, ["5", "6"], "duo")
    pool.best_slot = "2026-10-31_晚上"
    const result = previewBoardMultiMove(ctx, draft(ctx), "4"), saved = evaluateBoard(ctx, result.draft, true)
    expect(result.draft.multi?.bestSlot).toBe("2026-10-31_晚上")
    expect(saved.keepResultIds).toEqual(["duo"]); expect(saved.changedRows).toHaveLength(1)
    expect(saved.changedRows[0].group_members).toEqual(["1", "2", "3", "4"])
  })
  it("does not allow forging a different time for an existing pool", () => {
    const ctx = context(4); original(ctx, ["1", "2", "3"], "pool")
    const input = draft(ctx); input.multi!.bestSlot = "2026-10-31_晚上"; delete input.multi!.resultId
    expect(() => evaluateBoard(ctx, input, true)).toThrow("不能改变共同时间")
  })
})

describe("unmatched-only automatic retries", () => {
  it("preserves existing duos, excludes waiting people and can append matching multiplayer applicants", () => {
    const ctx = context(10); original(ctx, ["1", "2"], "duo"); original(ctx, ["3", "4", "5"], "pool")
    ctx.engine.candidates[5].gameTypePref = "多人"; ctx.engine.candidates[6].gameTypePref = "双人"; ctx.engine.candidates[7].gameTypePref = "双人"
    const input = draft(ctx); input.waitingDuoIds = ["9", "10"]; input.unmatchedIds = ["6", "7", "8"]
    input.brokenPairs = [{ key: "broken", memberIds: ["9", "10"] }]
    const result = rematchBoardDraft(ctx, input)
    expect(result.draft.duos[0]).toEqual(input.duos[0]); expect(result.draft.duos[1].memberIds.sort()).toEqual(["7", "8"])
    expect(result.draft.multi?.memberIds).toEqual(["3", "4", "5", "6"])
    expect(result.draft.waitingDuoIds).toEqual(["9", "10"]); expect(result.draft.brokenPairs).toEqual(input.brokenPairs)
    expect(result.draft.unmatchedIds).toEqual([])
  })
  it("can create the first multiplayer pool without including outside/waiting people", () => {
    const ctx = context(5); ctx.engine.candidates.forEach((c) => { c.gameTypePref = "多人" })
    const input = draft(ctx); input.waitingDuoIds = ["5"]; input.unmatchedIds = ["1", "2", "3", "4"]
    const result = rematchBoardDraft(ctx, input)
    expect(result.draft.multi?.memberIds).toEqual(["1", "2", "3", "4"]); expect(result.draft.waitingDuoIds).toEqual(["5"])
  })
  it("retains unmatched applicants whose only time conflicts with the fixed pool", () => {
    const ctx = context(4); original(ctx, ["1", "2", "3"], "pool")
    ctx.engine.candidates[3] = candidate("4", { gameTypePref: "多人", availability: { "2026-11-01": ["下午"] } })
    expect(rematchBoardDraft(ctx, draft(ctx)).draft.unmatchedIds).toEqual(["4"])
  })
  it("does not add to a locked multiplayer pool", () => {
    const ctx = context(4); original(ctx, ["1", "2", "3"], "pool", true); ctx.engine.candidates[3].gameTypePref = "多人"
    expect(rematchBoardDraft(ctx, draft(ctx)).draft.unmatchedIds).toEqual(["4"])
  })
  it("does not mutate the supplied draft or frozen engine", () => {
    const ctx = context(4), input = draft(ctx), before = structuredClone({ ctx, input })
    rematchBoardDraft(ctx, input)
    expect({ ctx, input }).toEqual(before)
  })
})
