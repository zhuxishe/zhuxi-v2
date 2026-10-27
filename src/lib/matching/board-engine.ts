import { inspectManualAdjustment, type ManualAdjustmentInspection } from "./adjustment-engine"
import type { BoardDraft, BoardDisplayRow, BoardSourceRow, BoardLayout, BoardMulti } from "./board-types"
import { checkGroupConstraints, checkHardConstraints, checkSharedMemberConstraints } from "./constraints"
import { findGroupBestSlot } from "./match-utils"
import type { MatchingEngineInput } from "./run-input"
import { runFullMatching, type MatchResultRow } from "./run-matching"
import type { MatchCandidate } from "./types"

export interface BoardContext {
  engine: MatchingEngineInput
  originalRows: BoardSourceRow[]
  cohortMemberIds: string[]
  /** Authoritative server capture; never accept lock state from the draft. */
  lockedMemberIds?: string[]
  originalLayout?: BoardLayout | null
}
export interface BoardEvaluation {
  draft: BoardDraft
  rows: BoardDisplayRow[]
  keepResultIds: string[]
  changedRows: MatchResultRow[]
  unmatchedIds: string[]
}
export class BoardValidationError extends Error {}
const fail = (message: string): never => { throw new BoardValidationError(message) }
const slotKey = (slot: string | null) => slot?.replace(/ /g, "_") ?? null
const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().every((id, index) => id === [...b].sort()[index])
const rowIds = (row: MatchResultRow) => row.group_members?.length ? row.group_members : [row.member_a_id, row.member_b_id!]
const multiEntries = (draft: BoardDraft): BoardMulti[] => draft.multiMode === "grouped" ? draft.multiGroups ?? [] : draft.multi ? [draft.multi] : []
const resultEntries = (draft: BoardDraft) => [...draft.duos, ...multiEntries(draft)]
const duoKey = (ids: readonly string[]) => `duo:${[...ids].sort().join(":")}`

function candidatesByMember(engine: MatchingEngineInput) {
  const mapping = new Map(engine.idMap), members = new Map<string, MatchCandidate>()
  for (const candidate of engine.candidates) {
    const memberId = mapping.get(candidate.submissionId) ?? candidate.submissionId
    if (members.has(memberId)) fail("本批候选人身份重复，请刷新后重试")
    members.set(memberId, candidate)
  }
  return members
}
function candidates(context: BoardContext, ids: readonly string[]) {
  const members = candidatesByMember(context.engine)
  return ids.map((id) => members.get(id) ?? fail("所选人员当前不符合匹配资格，请刷新核对"))
}
function hasSlot(members: MatchCandidate[], slot: string | null) {
  const normalized = slotKey(slot)
  return !!normalized && members.every((member) => Object.entries(member.availability).some(([date, times]) => times.some((time) => `${date}_${time}` === normalized)))
}

/** Build only UI-safe structural data. Cancelled historical results are not active assignments. */
export function createBoardDraft(rows: BoardSourceRow[], cohortMemberIds: string[], layout?: BoardLayout | null): BoardDraft {
  const active = rows.filter((row) => row.status !== "cancelled")
  const multis = active.filter((row) => !!row.group_members?.length)
  const grouped = layout?.multiMode === "grouped"
  if (!grouped && multis.length > 1) fail("当前方案存在多个多人池，请先核对历史结果")
  const assigned = new Set(active.flatMap(rowIds))
  const waitingDuoIds = (layout?.waitingDuoIds ?? []).filter((id) => cohortMemberIds.includes(id) && !assigned.has(id))
  const waiting = new Set(waitingDuoIds)
  const waitingMultiIds = grouped ? [...new Set(layout?.waitingMultiIds ?? [])].filter((id) => cohortMemberIds.includes(id) && !assigned.has(id) && !waiting.has(id)) : []
  const waitingMulti = new Set(waitingMultiIds)
  return {
    duos: active.filter((row) => !row.group_members?.length).map((row) => ({ key: row.id, resultId: row.id, memberIds: [row.member_a_id, row.member_b_id!], bestSlot: row.best_slot })),
    multi: grouped
      ? waitingMultiIds.length ? { key: "waiting-multi", memberIds: waitingMultiIds, bestSlot: layout?.multiPoolSlot ?? null } : null
      : multis[0] ? { key: multis[0].id, resultId: multis[0].id, memberIds: [...multis[0].group_members!], bestSlot: multis[0].best_slot } : null,
    ...(grouped ? { multiMode: "grouped" as const, multiGroups: multis.map((row) => ({ key: row.id, resultId: row.id, memberIds: [...row.group_members!], bestSlot: row.best_slot })) } : {}),
    waitingDuoIds,
    brokenPairs: (layout?.brokenPairs ?? []).filter((pair) => pair.memberIds.every((id) => waiting.has(id))).map((pair) => ({ ...pair, key: pair.key ?? duoKey(pair.memberIds) })),
    unmatchedIds: cohortMemberIds.filter((id) => !assigned.has(id) && !waiting.has(id) && !waitingMulti.has(id)),
  }
}

/** Verify the untrusted client shape before copying or iterating it. */
export function assertBoardDraft(value: unknown): asserts value is BoardDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("调整内容无效，请刷新后重试")
  const draft = value as BoardDraft
  const ids = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 10000 && v.every((id) => typeof id === "string" && id.length > 0 && id.length <= 200)
  const group = (v: unknown, size?: number) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false
    const item = v as BoardDraft["duos"][number]
    return typeof item.key === "string" && item.key.length > 0 && item.key.length <= 1000 && ids(item.memberIds)
      && (size === undefined || item.memberIds.length === size) && (item.resultId === undefined || typeof item.resultId === "string")
      && (item.bestSlot === null || typeof item.bestSlot === "string")
  }
  if (!Array.isArray(draft.duos) || draft.duos.length > 5000 || !draft.duos.every((item) => group(item, 2))
      || (draft.multi !== null && (!group(draft.multi) || !draft.multi.memberIds.length))
      || (draft.multiMode !== undefined && draft.multiMode !== "grouped")
      || (draft.multiGroups !== undefined && (!Array.isArray(draft.multiGroups) || draft.multiGroups.length > 5000 || !draft.multiGroups.every((item) => group(item) && item.memberIds.length > 0)))
      || (draft.multiMode !== "grouped" && !!draft.multiGroups?.length)
      || (draft.multiMode === "grouped" && draft.multi?.resultId !== undefined)
      || !ids(draft.waitingDuoIds) || !ids(draft.unmatchedIds) || !Array.isArray(draft.brokenPairs)
      || draft.brokenPairs.length > 5000 || !draft.brokenPairs.every((pair) => pair && typeof pair.key === "string" && ids(pair.memberIds) && pair.memberIds.length === 2)) fail("调整内容无效，请刷新后重试")
}

export function validateBoardStructure(context: BoardContext, draft: BoardDraft) {
  assertBoardDraft(draft)
  if (context.originalLayout?.multiMode === "grouped" && draft.multiMode !== "grouped") fail("已保存的多人分组不能恢复为旧的整池模式")
  const members = [...draft.duos.flatMap((duo) => duo.memberIds), ...(draft.multi?.memberIds ?? []), ...(draft.multiGroups ?? []).flatMap((group) => group.memberIds), ...draft.waitingDuoIds, ...draft.unmatchedIds]
  if (new Set(members).size !== members.length) fail("同一人员不能同时出现在多个位置")
  if (new Set(context.cohortMemberIds).size !== context.cohortMemberIds.length || !sameIds(members, context.cohortMemberIds)) fail("人员名单与本批次不一致，请刷新后重试")
  const keys = [...draft.duos.map((duo) => duo.key), ...(draft.multi ? [draft.multi.key] : []), ...(draft.multiGroups ?? []).map((group) => group.key), ...draft.brokenPairs.map((pair) => pair.key)]
  if (new Set(keys).size !== keys.length) fail("调整模块编号重复，请刷新后重试")
  const hints = draft.brokenPairs.flatMap((pair) => pair.memberIds)
  if (new Set(hints).size !== hints.length || hints.some((id) => !draft.waitingDuoIds.includes(id))) fail("已解除配对的提示与等待搭档人员不一致")
  const originals = new Map(context.originalRows.map((row) => [row.id, row]))
  const usedIds = resultEntries(draft).flatMap((entry) => entry.resultId ? [entry.resultId] : [])
  if (new Set(usedIds).size !== usedIds.length) fail("不能重复使用原配对编号")
  for (const entry of resultEntries(draft)) {
    if (!entry.resultId) continue
    const row = originals.get(entry.resultId)
    if (!row || row.status === "cancelled" || Boolean(row.group_members?.length) !== multiEntries(draft).includes(entry)) fail("原配对编号不属于当前有效结果")
    if (!multiEntries(draft).includes(entry) && !sameIds(entry.memberIds, rowIds(row!))) fail("新配对不能沿用其他配对编号")
  }
  const lockedMembers = new Set(context.lockedMemberIds ?? [])
  for (const memberId of lockedMembers) {
    if (!draft.waitingDuoIds.includes(memberId) && !draft.duos.some((duo) => duo.memberIds.includes(memberId))) {
      fail("已锁定的成员必须留在双人池，请先解锁再移出")
    }
  }
  for (const original of context.originalRows.filter((row) => row.status !== "cancelled" && !row.group_members?.length && rowIds(row).every((id) => lockedMembers.has(id)))) {
    const entry = draft.duos.find((duo) => duo.resultId === original.id)
    if (!entry || !sameIds(entry.memberIds, rowIds(original)) || slotKey(entry.bestSlot) !== slotKey(original.best_slot)) {
      fail("配对双方均已锁定，请先解锁其中一人再取消或调整配对")
    }
  }
  for (const row of context.originalRows.filter((row) => row.status === "locked")) {
    const entry = row.group_members?.length ? multiEntries(draft).find((group) => group.resultId === row.id) : draft.duos.find((duo) => duo.resultId === row.id)
    if (!entry || entry.resultId !== row.id || !sameIds(entry.memberIds, rowIds(row)) || slotKey(entry.bestSlot) !== slotKey(row.best_slot)) fail("已锁定的匹配不能调整，请先解锁并刷新")
  }
}

function inspectMulti(context: BoardContext, memberIds: string[], preferredSlot: string | null, allowIncomplete: boolean): ManualAdjustmentInspection {
  const members = candidates(context, memberIds), reasons: string[] = []
  const bestSlot = preferredSlot ?? findGroupBestSlot(members)
  if (!hasSlot(members, bestSlot)) reasons.push("所有成员必须拥有多人池当前相同的日期和时段")
  if (members.length < 3) {
    if (!allowIncomplete) reasons.push("多人池至少需要3人，请补入人员或将剩余人员移出后再保存")
    if (members.some((member) => member.gameTypePref === "双人")) reasons.push("选择了双人的成员不能加入多人池")
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) reasons.push(...checkSharedMemberConstraints(members[i], members[j], new Map(context.engine.pairRelations)).reasons)
    return { passed: reasons.length === 0, reasons, bestSlot, rows: [] }
  }
  reasons.push(...checkGroupConstraints(members[0], members.slice(1), context.engine.config, new Map(context.engine.pairRelations)).reasons)
  if (reasons.length) return { passed: false, reasons: [...new Set(reasons)], bestSlot, rows: [] }
  const inspection = inspectManualAdjustment(context.engine, memberIds)
  return { ...inspection, bestSlot, rows: inspection.rows.map((row) => ({ ...row, best_slot: bestSlot })) }
}

/** Scores and details are always computed on the server; exact original rows retain their original score/id/time. */
export function evaluateBoard(context: BoardContext, input: BoardDraft, forSave = false): BoardEvaluation {
  validateBoardStructure(context, input)
  const draft = structuredClone(input), rows: BoardDisplayRow[] = [], keepResultIds: string[] = [], changedRows: MatchResultRow[] = []
  const originals = new Map(context.originalRows.filter((row) => row.status !== "cancelled").map((row) => [row.id, row]))
  for (const entry of resultEntries(draft)) {
    const original = entry.resultId ? originals.get(entry.resultId) : undefined
    const unchanged = original && sameIds(entry.memberIds, rowIds(original)) && slotKey(entry.bestSlot) === slotKey(original.best_slot)
    if (unchanged) {
      // Preserve original results without recalculating historical scores or replacing IDs.
      const members = candidates(context, entry.memberIds)
      if (!hasSlot(members, original.best_slot)) fail("原匹配的推荐时间已不适用于所有成员，请取消后重新安排")
      const relations = new Map(context.engine.pairRelations)
      const constraint = original.group_members?.length
        ? checkGroupConstraints(members[0], members.slice(1), context.engine.config, relations)
        : checkHardConstraints(members[0], members[1], context.engine.config, relations)
      if (!original.group_members?.length && members.some((member) => member.gameTypePref === "多人")) fail("原双人结果中包含仅参加多人的成员，请取消后重新安排")
      if (!constraint.passed) fail(constraint.reasons.join("；"))
      keepResultIds.push(original.id)
      rows.push({ ...original, key: entry.key, resultId: original.id })
      continue
    }
    if (multiEntries(draft).includes(entry)) {
      const originalMulti = context.originalRows.find((row) => row.status !== "cancelled" && row.group_members?.length)
      if (draft.multiMode !== "grouped" && originalMulti && (entry.memberIds.some((id) => rowIds(originalMulti).includes(id))) && slotKey(entry.bestSlot) !== slotKey(originalMulti.best_slot)) fail("保留原多人池成员时不能改变共同时间")
      const inspection = inspectMulti(context, entry.memberIds, entry.bestSlot, !forSave)
      if (!inspection.passed) fail(inspection.reasons.join("；"))
      entry.bestSlot = inspection.bestSlot
      for (const row of inspection.rows) { rows.push({ ...row, key: entry.key, status: "draft" }); changedRows.push(row) }
    } else {
      const inspection = inspectManualAdjustment(context.engine, entry.memberIds)
      if (!inspection.passed) fail(inspection.reasons.join("；"))
      entry.bestSlot = inspection.bestSlot
      for (const row of inspection.rows) { rows.push({ ...row, key: entry.key, status: "draft" }); changedRows.push(row) }
    }
  }
  if (draft.multiMode === "grouped" && draft.multi) {
    const waitingMembers = candidates(context, draft.multi.memberIds)
    const originalWaiting = context.originalLayout?.multiMode === "grouped" ? context.originalLayout.waitingMultiIds ?? [] : context.originalRows.find((row) => row.status !== "cancelled" && row.group_members?.length)?.group_members ?? []
    const originalSlot = context.originalLayout?.multiMode === "grouped" ? context.originalLayout.multiPoolSlot : context.originalRows.find((row) => row.status !== "cancelled" && row.group_members?.length)?.best_slot
    if (draft.multi.memberIds.some((id) => originalWaiting.includes(id)) && slotKey(draft.multi.bestSlot) !== slotKey(originalSlot ?? null)) fail("保留原多人池成员时不能改变共同时间")
    if (!hasSlot(waitingMembers, draft.multi.bestSlot)) fail("待分组人员必须拥有池子当前相同的日期和时段")
    if (waitingMembers.some((member) => member.gameTypePref === "双人")) fail("选择了双人的成员不能加入多人池")
    const relations = new Map(context.engine.pairRelations)
    for (let i = 0; i < waitingMembers.length; i++) for (let j = i + 1; j < waitingMembers.length; j++) {
      const constraint = checkSharedMemberConstraints(waitingMembers[i], waitingMembers[j], relations)
      if (!constraint.passed) fail(constraint.reasons.join("；"))
    }
  }
  return { draft, rows, keepResultIds, changedRows, unmatchedIds: [...draft.waitingDuoIds, ...draft.unmatchedIds, ...(draft.multiMode === "grouped" ? draft.multi?.memberIds ?? [] : [])] }
}

function removeAvailableMember(draft: BoardDraft, memberId: string) {
  if (draft.duos.some((duo) => duo.memberIds.includes(memberId))) fail("已有搭档的人需要先取消原配对")
  draft.waitingDuoIds = draft.waitingDuoIds.filter((id) => id !== memberId)
  draft.unmatchedIds = draft.unmatchedIds.filter((id) => id !== memberId)
  draft.brokenPairs = draft.brokenPairs.filter((pair) => !pair.memberIds.includes(memberId))
  if (draft.multiGroups) draft.multiGroups = draft.multiGroups.map((group) => ({ ...group, memberIds: group.memberIds.filter((id) => id !== memberId) })).filter((group) => group.memberIds.length > 0)
  if (draft.multi?.memberIds.includes(memberId)) {
    draft.multi.memberIds = draft.multi.memberIds.filter((id) => id !== memberId)
    if (!draft.multi.memberIds.length) draft.multi = null
  }
}

export function previewBoardPair(context: BoardContext, input: BoardDraft, memberIds: [string, string]) {
  validateBoardStructure(context, input)
  const inspection = inspectManualAdjustment(context.engine, memberIds)
  if (!inspection.passed) return { draft: structuredClone(input), rows: [] as BoardDisplayRow[], passed: false, reasons: inspection.reasons }
  const draft = structuredClone(input)
  memberIds.forEach((id) => removeAvailableMember(draft, id))
  draft.duos.push({ key: duoKey(memberIds), memberIds: [...memberIds], bestSlot: inspection.bestSlot })
  const evaluated = evaluateBoard(context, draft)
  return { draft: evaluated.draft, rows: evaluated.rows, passed: true, reasons: [] }
}

export function previewBoardMultiMove(context: BoardContext, input: BoardDraft, memberId: string) {
  validateBoardStructure(context, input)
  if (context.lockedMemberIds?.includes(memberId)) fail("已锁定的成员必须留在双人池，请先解锁再移出")
  if (input.multi?.memberIds.includes(memberId)) return { ...evaluateBoard(context, input), passed: true, reasons: [] }
  const draft = structuredClone(input)
  removeAvailableMember(draft, memberId)
  const nextIds = [...(draft.multi?.memberIds ?? []), memberId]
  const inspection = inspectMulti(context, nextIds, draft.multi?.bestSlot ?? null, true)
  if (!inspection.passed) {
    draft.unmatchedIds.push(memberId)
    const evaluated = evaluateBoard(context, draft)
    return { draft: evaluated.draft, rows: evaluated.rows, passed: false, reasons: inspection.reasons }
  }
  draft.multi = { ...(draft.multi ?? { key: `multi:${memberId}` }), memberIds: nextIds, bestSlot: inspection.bestSlot }
  const evaluated = evaluateBoard(context, draft)
  return { draft: evaluated.draft, rows: evaluated.rows, passed: true, reasons: [] }
}

function nextGroupKey(draft: BoardDraft, memberId: string, slot: string) {
  const base = `group:${memberId}:${slotKey(slot)}`
  const occupied = new Set([
    ...draft.duos.map((entry) => entry.key),
    ...(draft.multi ? [draft.multi.key] : []),
    ...(draft.multiGroups ?? []).map((entry) => entry.key),
    ...draft.brokenPairs.map((entry) => entry.key),
  ])
  if (!occupied.has(base)) return base
  let suffix = 2
  while (occupied.has(`${base}:${suffix}`)) suffix++
  return `${base}:${suffix}`
}

/** Confirm a time-row selection as one independently published group. */
export function previewBoardGroup(context: BoardContext, input: BoardDraft, memberIds: string[], slot: string) {
  validateBoardStructure(context, input)
  if (memberIds.length < 3 || memberIds.length > 10000 || new Set(memberIds).size !== memberIds.length) fail("每个正式多人组至少需要3名不同成员")
  if (memberIds.some((id) => !input.multi?.memberIds.includes(id))) fail("只能从当前待分组池选择成员")
  const inspection = inspectMulti(context, memberIds, slot, false)
  if (!inspection.passed) return { draft: structuredClone(input), rows: [] as BoardDisplayRow[], passed: false, reasons: inspection.reasons }
  const draft = structuredClone(input)
  if (draft.multiMode !== "grouped") {
    draft.multiMode = "grouped"
    draft.multiGroups = []
    if (draft.multi) draft.multi = { key: "waiting-multi", memberIds: draft.multi.memberIds, bestSlot: draft.multi.bestSlot }
  }
  memberIds.forEach((id) => removeAvailableMember(draft, id))
  draft.multiGroups = [...(draft.multiGroups ?? []), { key: nextGroupKey(draft, memberIds[0], slot), memberIds: [...memberIds], bestSlot: inspection.bestSlot }]
  const evaluated = evaluateBoard(context, draft)
  return { draft: evaluated.draft, rows: evaluated.rows, passed: true, reasons: [] }
}

/** Moving into a formal group keeps its chosen time and validates every member. */
export function previewBoardGroupMove(context: BoardContext, input: BoardDraft, memberId: string, groupKey: string) {
  validateBoardStructure(context, input)
  const target = input.multiMode === "grouped" ? input.multiGroups?.find((group) => group.key === groupKey) : undefined
  if (!target) return fail("目标多人组不存在，请刷新后重试")
  if (target.memberIds.includes(memberId)) return { ...evaluateBoard(context, input), passed: true, reasons: [] }
  if (context.lockedMemberIds?.includes(memberId)) fail("已锁定的成员必须留在双人池，请先解锁再移出")
  const inspection = inspectMulti(context, [...target.memberIds, memberId], target.bestSlot, true)
  if (!inspection.passed) return { draft: structuredClone(input), rows: [] as BoardDisplayRow[], passed: false, reasons: inspection.reasons }
  const draft = structuredClone(input)
  removeAvailableMember(draft, memberId)
  draft.multiGroups = draft.multiGroups!.map((group) => group.key === groupKey ? { ...group, memberIds: [...group.memberIds, memberId] } : group)
  const evaluated = evaluateBoard(context, draft)
  return { draft: evaluated.draft, rows: evaluated.rows, passed: true, reasons: [] }
}

/** The automatic algorithm sees only the current unmatched pool; waiting-duo members stay outside. */
export function rematchBoardDraft(context: BoardContext, input: BoardDraft): BoardEvaluation {
  validateBoardStructure(context, input)
  const draft = structuredClone(input), unmatched = new Set(input.unmatchedIds)
  const mapping = new Map(context.engine.idMap)
  const subset = context.engine.candidates.filter((candidate) => unmatched.has(mapping.get(candidate.submissionId) ?? candidate.submissionId))
  const automatic = runFullMatching(subset, context.engine.config, mapping, new Map(context.engine.pairRelations), { allowMultiPool: !draft.multi })
  const newlyMatched = new Set(automatic.rows.flatMap(rowIds))
  draft.unmatchedIds = draft.unmatchedIds.filter((id) => !newlyMatched.has(id))
  for (const row of automatic.rows) {
    if (row.group_members?.length) draft.multi = { key: `multi:${row.group_members[0]}`, memberIds: [...row.group_members], bestSlot: row.best_slot }
    else draft.duos.push({ key: duoKey([row.member_a_id, row.member_b_id!]), memberIds: [row.member_a_id, row.member_b_id!], bestSlot: row.best_slot })
  }
  const lockedMulti = input.multi?.resultId && context.originalRows.some((row) => row.id === input.multi!.resultId && row.status === "locked")
  if (input.multi && draft.multi && !lockedMulti) {
    const eligible = candidatesByMember(context.engine)
    let remaining = draft.unmatchedIds.filter((id) => eligible.has(id))
    // Check additions against the complete fixed pool, including preferences of its existing members.
    // Two-at-once permits complementary gender preferences without weakening any constraint.
    let accepted = true
    while (accepted) {
      accepted = false
      // Restart with single additions after any successful pair addition: a
      // one-person waiting pool may only become viable after two people join.
      outer: for (let size = 1; size <= 2; size++) {
        for (let i = 0; i < remaining.length; i++) {
          const choices = size === 1 ? [[remaining[i]]] : remaining.slice(i + 1).map((id) => [remaining[i], id])
          for (const ids of choices) {
            const inspection = inspectMulti(context, [...draft.multi.memberIds, ...ids], draft.multi.bestSlot, false)
            if (!inspection.passed) continue
            draft.multi.memberIds.push(...ids)
            draft.unmatchedIds = draft.unmatchedIds.filter((id) => !ids.includes(id))
            remaining = remaining.filter((id) => !ids.includes(id))
            accepted = true
            break outer
          }
        }
      }
    }
  }
  return evaluateBoard(context, draft)
}
