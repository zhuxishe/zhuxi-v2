import { describe, expect, it } from "vitest"
import { createBoardDraft, evaluateBoard, previewBoardGroup, previewBoardGroupMove, previewBoardMultiMove, previewBoardPair, previewBoardSmallGroupCandidates, rematchBoardDraft, validateBoardStructure, type BoardContext } from "./board-engine"
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

describe("confirmed 4–6 person group boundaries", () => {
  it("persists an explicit group kind while ordinary time groups retain their old size range", () => {
    const ctx = context(11); original(ctx, ctx.cohortMemberIds, "pool")
    const first = previewBoardGroup(ctx, draft(ctx), ["1", "2", "3", "4"], "2026-10-31_下午", "small")
    expect(first.draft.multiGroups![0].groupKind).toBe("small")
    const second = previewBoardGroup(ctx, first.draft, ["5", "6", "7", "8", "9", "10", "11"], "2026-10-31_晚上")
    expect(second.draft.multiGroups![1].groupKind).toBeUndefined()
    expect(evaluateBoard(ctx, second.draft, true).changedRows.map((row) => row.group_members?.length)).toEqual([4, 7])
    expect(() => previewBoardGroup(ctx, draft(ctx), ["1", "2", "3"], "2026-10-31_下午", "small")).toThrow("4至6")
    expect(() => previewBoardGroup(ctx, draft(ctx), ["1", "2", "3", "4", "5", "6", "7"], "2026-10-31_下午", "small")).toThrow("4至6")
  })
  it("allows temporary 3 and 7 person edits but blocks saving until the marked groups are repaired", () => {
    const ctx = context(10); original(ctx, ctx.cohortMemberIds, "pool")
    const first = previewBoardGroup(ctx, draft(ctx), ["1", "2", "3", "4"], "2026-10-31_下午", "small")
    const both = previewBoardGroup(ctx, first.draft, ["5", "6", "7", "8", "9", "10"], "2026-10-31_下午", "small").draft
    const changed = previewBoardGroupMove(ctx, both, "4", both.multiGroups![1].key).draft
    expect(changed.multiGroups!.map((group) => group.memberIds.length)).toEqual([3, 7])
    expect(() => evaluateBoard(ctx, changed, true)).toThrow("4–6人小组")
    const fixed = previewBoardGroupMove(ctx, changed, "4", both.multiGroups![0].key).draft
    expect(evaluateBoard(ctx, fixed, true).changedRows).toHaveLength(2)
  })
  it("restores a saved small-group marker by set equality, without relabeling other groups", () => {
    const ctx = context(9); original(ctx, ["1", "2", "3", "4"], "small"); original(ctx, ["5", "6", "7", "8"], "ordinary")
    ctx.originalLayout = { waitingDuoIds: [], brokenPairs: [], multiMode: "grouped", waitingMultiIds: ["9"], multiPoolSlot: "2026-10-31_下午", smallGroupMemberIds: [["4", "2", "3", "1"]] }
    const restored = createBoardDraft(ctx.originalRows, ctx.cohortMemberIds, ctx.originalLayout)
    expect(restored.multiGroups!.map((group) => group.groupKind)).toEqual(["small", undefined])
    expect(evaluateBoard(ctx, restored, true).keepResultIds).toEqual(["small", "ordinary"])
    delete restored.multiGroups![0].groupKind
    expect(() => evaluateBoard(ctx, restored, true)).toThrow("不能改为普通时间分组")
  })
  it("previews a recommendation change without assignment and retains subset/time/lock validation", () => {
    const ctx = context(8); original(ctx, ctx.cohortMemberIds.slice(0, 7), "pool")
    const input = draft(ctx), before = structuredClone(input)
    expect(previewBoardSmallGroupCandidates(ctx, input, ["1", "2", "3"], "2026-10-31_下午")).toMatchObject({ passed: true, draft: before, rows: [] })
    expect(previewBoardSmallGroupCandidates(ctx, input, ctx.cohortMemberIds.slice(0, 7), "2026-10-31_下午").passed).toBe(true)
    expect(previewBoardSmallGroupCandidates(ctx, input, ["1", "2", "3", "4"], "2026-11-01_下午").passed).toBe(false)
    expect(() => previewBoardSmallGroupCandidates(ctx, input, ["1", "8"], "2026-10-31_下午")).toThrow("待分组池")
    ctx.originalRows[0].status = "locked"
    expect(() => previewBoardSmallGroupCandidates(ctx, input, ["1", "2", "3", "4"], "2026-10-31_下午")).toThrow("已锁定")
    expect(input).toEqual(before)
  })
  it("does not allow malformed kinds or small markers on a legacy pool or duo", () => {
    const ctx = context(8); original(ctx, ctx.cohortMemberIds, "pool")
    const input = draft(ctx)
    input.multi!.groupKind = "small"
    expect(() => evaluateBoard(ctx, input)).toThrow("调整内容无效")
    delete input.multi!.groupKind
    const grouped = previewBoardGroup(ctx, input, ["1", "2", "3", "4"], "2026-10-31_下午", "small").draft
    Object.assign(grouped.multiGroups![0], { groupKind: "forged" })
    expect(() => evaluateBoard(ctx, grouped)).toThrow("调整内容无效")
  })
})

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


describe("server-captured individual duo pool pins", () => {
  it.each(["1", "2"])("allows a singly pinned member %s to split and re-pair inside the duo pool", (memberId) => {
    const ctx = context(4); original(ctx, ["1", "2"], "duo"); ctx.lockedMemberIds = [memberId]
    const input = draft(ctx), separated = structuredClone(input)
    separated.duos = []; separated.waitingDuoIds = ["1", "2"]
    expect(evaluateBoard(ctx, separated, true).draft.waitingDuoIds).toEqual(["1", "2"])
    const paired = previewBoardPair(ctx, separated, [memberId, "3"])
    expect(paired.passed).toBe(true)
    expect(paired.draft.duos[0].memberIds).toEqual([memberId, "3"])
    expect(() => previewBoardMultiMove(ctx, separated, memberId)).toThrow("必须留在双人池")
    const otherId = memberId === "1" ? "2" : "1"
    const movedOther = previewBoardMultiMove(ctx, separated, otherId)
    expect(movedOther.draft.waitingDuoIds).toEqual([memberId])
  })
  it("fixes a saved pair only when both members are pinned", () => {
    const ctx = context(4); original(ctx, ["1", "2"], "duo"); ctx.lockedMemberIds = ["1", "2"]
    const input = draft(ctx)
    expect(evaluateBoard(ctx, input, true).keepResultIds).toEqual(["duo"])
    const separated = structuredClone(input); separated.duos = []; separated.waitingDuoIds = ["1", "2"]
    expect(() => evaluateBoard(ctx, separated)).toThrow("双方均已锁定")
    expect(() => previewBoardPair(ctx, separated, ["1", "3"])).toThrow("双方均已锁定")
    expect(() => rematchBoardDraft(ctx, separated)).toThrow("双方均已锁定")
    expect(() => evaluateBoard(ctx, { ...input, duos: [{ ...input.duos[0], resultId: undefined }] }, true)).toThrow("双方均已锁定")
    expect(() => evaluateBoard(ctx, { ...input, duos: [{ ...input.duos[0], bestSlot: "2026-10-31_晚上" }] }, true)).toThrow("双方均已锁定")
    ctx.lockedMemberIds = ["1"]
    expect(evaluateBoard(ctx, separated, true).draft.waitingDuoIds).toEqual(["1", "2"])
  })
  it("allows a pinned waiting member to pair while rejecting any move outside the duo pool", () => {
    const ctx = context(5)
    ctx.lockedMemberIds = ["1"]
    ctx.originalLayout = { waitingDuoIds: ["1", "2"], brokenPairs: [{ key: "grey", memberIds: ["1", "2"] }] }
    const input = createBoardDraft(ctx.originalRows, ctx.cohortMemberIds, ctx.originalLayout)
    const paired = previewBoardPair(ctx, input, ["1", "2"])
    expect(paired.passed).toBe(true)
    expect(paired.draft.duos[0].memberIds).toEqual(["1", "2"])
    expect(() => previewBoardMultiMove(ctx, input, "1")).toThrow("必须留在双人池")
    const forged = { ...input, waitingDuoIds: ["2"], brokenPairs: [], unmatchedIds: [...input.unmatchedIds, "1"] }
    expect(() => evaluateBoard(ctx, forged, true)).toThrow("必须留在双人池")
    expect(() => rematchBoardDraft(ctx, forged)).toThrow("必须留在双人池")
    const rematched = rematchBoardDraft(ctx, input)
    expect(rematched.draft.waitingDuoIds).toEqual(["1", "2"])
    expect(rematched.draft.duos.every((duo) => !duo.memberIds.includes("1"))).toBe(true)
  })
  it("lets an unlocked former partner move while the pinned waiting member stays", () => {
    const ctx = context(5)
    ctx.lockedMemberIds = ["1"]
    ctx.originalLayout = { waitingDuoIds: ["1", "2"], brokenPairs: [{ key: "grey", memberIds: ["1", "2"] }] }
    const input = createBoardDraft(ctx.originalRows, ctx.cohortMemberIds, ctx.originalLayout)
    const paired = previewBoardPair(ctx, input, ["2", "3"])
    expect(paired.passed).toBe(true)
    expect(paired.draft.waitingDuoIds).toEqual(["1"])
    expect(paired.draft.brokenPairs).toEqual([])
    expect(evaluateBoard(ctx, paired.draft, true).draft.waitingDuoIds).toEqual(["1"])
  })
  it("rejects captured pins outside either duo or waiting placements", () => {
    const ctx = context(4); ctx.lockedMemberIds = ["1"]
    expect(() => evaluateBoard(ctx, draft(ctx), true)).toThrow("必须留在双人池")
  })
  it("does not remove historical whole-result locks when individual pins are empty", () => {
    const ctx = context(4); original(ctx, ["1", "2"], "old-lock", true); ctx.lockedMemberIds = []
    const input = draft(ctx); input.duos = []; input.waitingDuoIds = ["1", "2"]
    expect(() => evaluateBoard(ctx, input, true)).toThrow("已锁定的匹配")
  })
})


describe("independent formal multiplayer groups", () => {
  it("converts a legacy pool only after explicit group confirmation and keeps the remaining waiting time", () => {
    const ctx = context(8); original(ctx, ["1", "2", "3", "4", "5", "6", "7"], "pool")
    const input = draft(ctx), before = structuredClone(input)
    const result = previewBoardGroup(ctx, input, ["1", "2", "3"], "2026-10-31_晚上")
    expect(input).toEqual(before)
    expect(result.draft).toMatchObject({ multiMode: "grouped", multi: { key: "waiting-multi", memberIds: ["4", "5", "6", "7"], bestSlot: "2026-10-31_下午" },
      multiGroups: [{ memberIds: ["1", "2", "3"], bestSlot: "2026-10-31_晚上" }], unmatchedIds: ["8"] })
    expect(result.draft.multi?.resultId).toBeUndefined()
    const saved = evaluateBoard(ctx, result.draft, true)
    expect(saved.keepResultIds).toEqual([])
    expect(saved.changedRows).toHaveLength(1)
    expect(saved.unmatchedIds).toEqual(["8", "4", "5", "6", "7"])
  })
  it("saves multiple disjoint groups at separate shared times without a six-person cap", () => {
    const ctx = context(11); original(ctx, ctx.cohortMemberIds, "pool")
    const first = previewBoardGroup(ctx, draft(ctx), ["1", "2", "3", "4", "5", "6", "7"], "2026-10-31_晚上")
    const second = previewBoardGroup(ctx, first.draft, ["8", "9", "10", "11"], "2026-10-31_下午")
    const saved = evaluateBoard(ctx, second.draft, true)
    expect(saved.draft.multi).toBeNull()
    expect(saved.changedRows.map((row) => [row.group_members?.length, row.best_slot])).toEqual([[7, "2026-10-31_晚上"], [4, "2026-10-31_下午"]])
    expect(saved.unmatchedIds).toEqual([])
  })
  it("allows one or two waiting people to remain in a saved draft without turning them into a result", () => {
    const ctx = context(5); original(ctx, ctx.cohortMemberIds, "pool")
    const grouped = previewBoardGroup(ctx, draft(ctx), ["1", "2", "3"], "2026-10-31_下午").draft
    const saved = evaluateBoard(ctx, grouped, true)
    expect(saved.rows).toHaveLength(1); expect(saved.unmatchedIds).toEqual(["4", "5"])
    expect(saved.draft.multi?.memberIds).toEqual(["4", "5"])
  })
  it("does not require the remaining waiting people to already satisfy a final group gender preference", () => {
    const ctx = context(7)
    ctx.engine.candidates.forEach((member, index) => { member.gender = index < 4 ? "男" : "女"; member.genderPref = index < 4 ? "女" : "男" })
    original(ctx, ctx.cohortMemberIds, "pool")
    const grouped = previewBoardGroup(ctx, draft(ctx), ["1", "5", "6", "7"], "2026-10-31_下午").draft
    expect(evaluateBoard(ctx, grouped, true).unmatchedIds).toEqual(["2", "3", "4"])
    expect(previewBoardGroup(ctx, grouped, ["2", "3", "4"], "2026-10-31_下午").passed).toBe(false)
  })
  it("preserves the waiting pool anchor while permitting another valid time for a formal group", () => {
    const ctx = context(6); original(ctx, ctx.cohortMemberIds, "pool")
    const grouped = previewBoardGroup(ctx, draft(ctx), ["1", "2", "3"], "2026-10-31_晚上").draft
    grouped.multi!.bestSlot = "2026-10-31_晚上"
    expect(() => evaluateBoard(ctx, grouped, true)).toThrow("不能改变共同时间")
  })
  it("reloads saved group membership and separates waiting people from unmatched diagnostics", () => {
    const ctx = context(9); original(ctx, ["1", "2", "3"], "first"); original(ctx, ["4", "5", "6"], "second")
    const layout = { waitingDuoIds: ["9"], brokenPairs: [], multiMode: "grouped" as const, waitingMultiIds: ["7", "7", "1", "outside"], multiPoolSlot: "2026-10-31_下午" }
    ctx.originalLayout = layout
    const restored = createBoardDraft(ctx.originalRows, ctx.cohortMemberIds, layout)
    expect(restored.multiGroups?.map((group) => group.resultId)).toEqual(["first", "second"])
    expect(restored.multi?.memberIds).toEqual(["7"]); expect(restored.waitingDuoIds).toEqual(["9"]); expect(restored.unmatchedIds).toEqual(["8"])
    expect(evaluateBoard(ctx, restored, true).keepResultIds).toEqual(["first", "second"])
    expect(() => evaluateBoard(ctx, { ...restored, multiMode: undefined, multiGroups: [] })).toThrow("不能恢复")
  })
  it("allocates a distinct group key when a former first member creates another group at the same time", () => {
    const ctx = context(7); original(ctx, ctx.cohortMemberIds, "pool")
    const first = previewBoardGroup(ctx, draft(ctx), ctx.cohortMemberIds, "2026-10-31_下午").draft
    const originalKey = first.multiGroups![0].key
    let returned = first
    for (const memberId of ["1", "5", "6"]) returned = previewBoardMultiMove(ctx, returned, memberId).draft
    expect(returned.multiGroups![0]).toMatchObject({ key: originalKey, memberIds: ["2", "3", "4", "7"] })
    const next = previewBoardGroup(ctx, returned, ["1", "5", "6"], "2026-10-31_下午").draft
    expect(next.multiGroups?.map((group) => group.key)).toEqual([originalKey, `${originalKey}:2`])
    expect(evaluateBoard(ctx, next, true).changedRows.map((row) => row.group_members)).toEqual([["2", "3", "4", "7"], ["1", "5", "6"]])
  })
  it("never lets the same person be confirmed from another candidate row after joining a group", () => {
    const ctx = context(6); original(ctx, ctx.cohortMemberIds, "pool")
    const first = previewBoardGroup(ctx, draft(ctx), ["1", "2", "3"], "2026-10-31_下午")
    expect(() => previewBoardGroup(ctx, first.draft, ["1", "4", "5"], "2026-10-31_晚上")).toThrow("待分组池")
    const duplicate = structuredClone(first.draft)
    duplicate.multiGroups!.push({ key: "duplicate", memberIds: ["1", "4", "5"], bestSlot: "2026-10-31_晚上" })
    expect(() => evaluateBoard(ctx, duplicate)).toThrow("同一人员")
  })
  it("rejects unshared selected times without relocating any waiting member", () => {
    const ctx = context(4); original(ctx, ctx.cohortMemberIds, "pool")
    const input = draft(ctx)
    const result = previewBoardGroup(ctx, input, ["1", "2", "3"], "2026-11-01_下午")
    expect(result.passed).toBe(false); expect(result.draft).toEqual(input)
    expect(() => previewBoardGroup(ctx, input, ["1", "1", "2"], "2026-10-31_下午")).toThrow("不同成员")
  })
  it("keeps whole-pool and existing-group locks authoritative during conversion and moves", () => {
    const ctx = context(7); original(ctx, ["1", "2", "3", "4", "5", "6"], "pool", true)
    expect(() => previewBoardGroup(ctx, draft(ctx), ["1", "2", "3"], "2026-10-31_下午")).toThrow("已锁定")
    ctx.originalLayout = { waitingDuoIds: [], brokenPairs: [], multiMode: "grouped", waitingMultiIds: [], multiPoolSlot: null }
    const restored = createBoardDraft(ctx.originalRows, ctx.cohortMemberIds, ctx.originalLayout)
    expect(() => previewBoardGroupMove(ctx, restored, "7", "pool")).toThrow("已锁定")
    expect(() => previewBoardMultiMove(ctx, restored, "1")).toThrow("已锁定")
  })
  it("protects personally pinned duo members and refuses partnered people entering a group", () => {
    const ctx = context(6); original(ctx, ["1", "2", "3"], "pool"); original(ctx, ["4", "5"], "duo")
    const first = previewBoardGroup(ctx, draft(ctx), ["1", "2", "3"], "2026-10-31_下午").draft
    const key = first.multiGroups![0].key
    expect(() => previewBoardGroupMove(ctx, first, "4", key)).toThrow("先取消")
    const separated = structuredClone(first); separated.duos = []; separated.waitingDuoIds = ["4", "5"]
    ctx.lockedMemberIds = ["4"]
    expect(() => previewBoardGroupMove(ctx, separated, "4", key)).toThrow("必须留在双人池")
  })
  it("lets groups temporarily fall below three during movement but refuses to save until repaired", () => {
    const ctx = context(7); original(ctx, ["1", "2", "3", "4", "5", "6"], "pool")
    const first = previewBoardGroup(ctx, draft(ctx), ["1", "2", "3"], "2026-10-31_下午")
    const second = previewBoardGroup(ctx, first.draft, ["4", "5", "6"], "2026-10-31_晚上")
    const moved = previewBoardGroupMove(ctx, second.draft, "3", second.draft.multiGroups![1].key)
    expect(moved.draft.multiGroups?.map((group) => group.memberIds.length)).toEqual([2, 4])
    expect(() => evaluateBoard(ctx, moved.draft, true)).toThrow("至少需要3人")
    const repaired = previewBoardGroupMove(ctx, moved.draft, "7", moved.draft.multiGroups![0].key)
    expect(evaluateBoard(ctx, repaired.draft, true).changedRows).toHaveLength(2)
  })
  it("rejects a group move at the wrong time and keeps all source placements unchanged", () => {
    const ctx = context(4); original(ctx, ["1", "2", "3"], "pool")
    ctx.engine.candidates[3].availability = { "2026-10-31": ["晚上"] }
    const grouped = previewBoardGroup(ctx, draft(ctx), ["1", "2", "3"], "2026-10-31_下午").draft
    const result = previewBoardGroupMove(ctx, grouped, "4", grouped.multiGroups![0].key)
    expect(result.passed).toBe(false); expect(result.draft).toEqual(grouped)
    expect(() => previewBoardGroupMove(ctx, grouped, "4", "missing")).toThrow("不存在")
  })
  it("retains shared relationship vetoes for every member in a newly confirmed group", () => {
    const ctx = context(4); original(ctx, ctx.cohortMemberIds, "pool")
    ctx.engine.pairRelations.push([pairKey("2", "3"), { playerA: "2", playerB: "3", status: "blacklist", totalPairCount: 1, hasMutualFive: false, reason: "private" }])
    expect(previewBoardGroup(ctx, draft(ctx), ["1", "2", "3"], "2026-10-31_下午").passed).toBe(false)
  })
  it("preserves formal groups and excludes waiting people when re-matching only unmatched people", () => {
    const ctx = context(9); ctx.engine.candidates.forEach((member) => { member.gameTypePref = "多人" })
    original(ctx, ["1", "2", "3", "4"], "pool")
    const grouped = previewBoardGroup(ctx, draft(ctx), ["1", "2", "3"], "2026-10-31_晚上").draft
    const result = rematchBoardDraft(ctx, grouped)
    expect(result.draft.multiGroups).toEqual(grouped.multiGroups)
    expect(result.draft.multiMode).toBe("grouped")
    expect(result.draft.multi?.memberIds).toEqual(["4", "5", "6", "7", "8", "9"])
    expect(result.draft.unmatchedIds).toEqual([])
  })
  it("keeps new automatic multiplayer results waiting instead of inventing formal groups", () => {
    const ctx = context(6); ctx.engine.candidates.forEach((member) => { member.gameTypePref = "多人" })
    original(ctx, ["1", "2", "3"], "pool")
    const grouped = previewBoardGroup(ctx, draft(ctx), ["1", "2", "3"], "2026-10-31_晚上").draft
    const result = rematchBoardDraft(ctx, grouped)
    expect(result.draft.multiGroups).toEqual(grouped.multiGroups)
    expect(result.draft.multi?.memberIds).toEqual(["4", "5", "6"])
    expect(evaluateBoard(ctx, result.draft, true).changedRows).toHaveLength(1)
  })
})
