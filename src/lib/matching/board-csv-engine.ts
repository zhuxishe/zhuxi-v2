import { createHash } from "node:crypto"
import { evaluateBoard, validateBoardStructure, type BoardContext } from "./board-engine"
import { checkGroupConstraints, checkHardConstraints } from "./constraints"
import { getBoardTimeOptions } from "./board-time-options"
import { readBoardCsvAssignments } from "./board-csv"
import type { BoardDraft, BoardDuo, BoardMulti } from "./board-types"
import type { BoardCsvAssignment, BoardCsvChange, BoardCsvCounts, BoardCsvIssue, BoardCsvPerson, BoardCsvPreviewResult } from "./board-csv-types"

type Group = { pool: "双人" | "多人"; code: string; section: "small" | "time" | null; slot: string; ids: string[]; row: number }
const slotKey = (slot: string | null) => slot?.replace(" ", "_") ?? null
const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i])
const multis = (draft: BoardDraft) => draft.multiMode === "grouped" ? draft.multiGroups ?? [] : draft.multi ? [draft.multi] : []
const groupId = (kind: "双人" | "多人", ids: readonly string[]) => `${kind}:${[...ids].sort().join(":")}`
const newKey = (group: Group) => `csv:${createHash("sha256").update(groupId(group.pool, group.ids) + group.section + group.slot).digest("hex").slice(0, 32)}`

function counts(draft: BoardDraft): BoardCsvCounts {
  const groups = multis(draft)
  return { duoGroups: draft.duos.length, multiGroups: groups.length, matched: draft.duos.length * 2 + groups.reduce((n, group) => n + group.memberIds.length, 0), unmatched: draft.unmatchedIds.length, waitingDuo: draft.waitingDuoIds.length, waitingMulti: draft.multiMode === "grouped" ? draft.multi?.memberIds.length ?? 0 : 0 }
}
function membership(draft: BoardDraft) {
  const map = new Map<string, { signature: string; label: string; members: string[]; slot: string | null; section: string | null; pool: string }>()
  const pending = (id: string, pool: string, label: string) => map.set(id, { signature: JSON.stringify({ pool }), label, members: [], slot: null, section: null, pool })
  const group = (ids: string[], pool: string, slot: string | null, section: string | null) => {
    const item = { signature: JSON.stringify({ pool, members: [...ids].sort(), slot: slotKey(slot), section }), label: "", members: ids, slot: slotKey(slot), section, pool }
    ids.forEach((id) => map.set(id, item))
  }
  draft.duos.forEach((duo) => group(duo.memberIds, "双人", duo.bestSlot, null))
  multis(draft).forEach((multi) => group(multi.memberIds, "多人", multi.bestSlot, multi.groupKind === "small" ? "small" : "time"))
  draft.waitingDuoIds.forEach((id) => pending(id, "等待搭档", "双人池 · 等待搭档"))
  if (draft.multiMode === "grouped") draft.multi?.memberIds.forEach((id) => pending(id, "待分组", "多人池 · 待分组"))
  draft.unmatchedIds.forEach((id) => pending(id, "未匹配", "未匹配池"))
  return map
}
function summary(before: BoardDraft, after: BoardDraft, people: readonly BoardCsvPerson[]) {
  const names = new Map(people.map((person) => [person.id, person.name])), a = membership(before), b = membership(after)
  const describe = (item: ReturnType<typeof membership> extends Map<string, infer Value> ? Value : never) => item.label || `${item.pool}组 · ${item.members.map((id) => names.get(id) ?? "姓名未提供").join("、")} · ${item.slot?.replace("_", " ") ?? "待安排"}${item.section ? ` · ${item.section === "small" ? "4–6人分组" : "按时间分组"}` : ""}`
  const changes: BoardCsvChange[] = people.filter((person) => a.get(person.id)?.signature !== b.get(person.id)?.signature).map((person) => ({ memberId: person.id, name: person.name, before: describe(a.get(person.id)!), after: describe(b.get(person.id)!) }))
  const groups = (draft: BoardDraft) => new Map([...draft.duos.map((duo) => [groupId("双人", duo.memberIds), slotKey(duo.bestSlot)] as const), ...multis(draft).map((multi) => [groupId("多人", multi.memberIds), slotKey(multi.bestSlot)] as const)])
  const oldGroups = groups(before), newGroups = groups(after)
  return { changes, summary: { before: counts(before), after: counts(after), changedMembers: changes.length, createdGroups: [...newGroups.keys()].filter((id) => !oldGroups.has(id)).length, removedGroups: [...oldGroups.keys()].filter((id) => !newGroups.has(id)).length, changedTimes: [...newGroups].filter(([id, slot]) => oldGroups.has(id) && oldGroups.get(id) !== slot).length } }
}

function collectGroups(assignments: BoardCsvAssignment[]): { groups: Group[]; errors: BoardCsvIssue[] } {
  const groups = new Map<string, Group>(), errors: BoardCsvIssue[] = []
  for (const item of assignments) {
    if (!item.groupCode || item.pool === "未匹配") continue
    const old = groups.get(item.groupCode)
    if (old && (old.pool !== item.pool || old.section !== item.section || old.slot !== item.slot)) errors.push({ row: item.row, group: item.groupCode, message: "同组的目标池、分组栏和推荐时间必须一致。" })
    else if (old) old.ids.push(item.memberId)
    else groups.set(item.groupCode, { pool: item.pool, code: item.groupCode, section: item.section, slot: item.slot!, ids: [item.memberId], row: item.row })
  }
  for (const group of groups.values()) {
    if (group.pool === "双人" && group.ids.length !== 2) errors.push({ row: group.row, group: group.code, message: `双人组必须恰好2人，当前${group.ids.length}人。` })
    if (group.pool === "多人" && group.ids.length < 3) errors.push({ row: group.row, group: group.code, message: `正式多人组至少3人，当前${group.ids.length}人。` })
  }
  return { groups: [...groups.values()], errors }
}

function buildDraft(original: BoardDraft, assignments: BoardCsvAssignment[], groups: Group[]): BoardDraft {
  const duos: BoardDuo[] = [], multiGroups: BoardMulti[] = []
  for (const group of groups) {
    if (group.pool === "双人") {
      const old = original.duos.find((duo) => sameIds(duo.memberIds, group.ids))
      duos.push(old && slotKey(old.bestSlot) === group.slot ? structuredClone(old) : { ...(old ? { key: old.key, resultId: old.resultId } : { key: newKey(group) }), memberIds: [...group.ids] as [string, string], bestSlot: group.slot, manuallyScheduled: true })
    } else {
      const old = multis(original).find((multi) => sameIds(multi.memberIds, group.ids) && (multi.groupKind === "small" ? "small" : "time") === group.section)
      multiGroups.push(old && slotKey(old.bestSlot) === group.slot ? structuredClone(old) : { ...(old ? { key: old.key, resultId: old.resultId } : { key: newKey(group) }), memberIds: [...group.ids], bestSlot: group.slot, ...(group.section === "small" ? { groupKind: "small", manuallyAdjusted: true } : {}) })
    }
  }
  const waitingDuoIds = assignments.filter((item) => item.pool === "双人" && !item.groupCode).map((item) => item.memberId)
  const waitingMultiIds = assignments.filter((item) => item.pool === "多人" && !item.groupCode).map((item) => item.memberId)
  const legacyUnchanged = original.multiMode !== "grouped" && !waitingMultiIds.length && multiGroups.length === 1 && !!original.multi && multiGroups[0].key === original.multi.key && sameIds(multiGroups[0].memberIds, original.multi.memberIds) && slotKey(multiGroups[0].bestSlot) === slotKey(original.multi.bestSlot) && !multiGroups[0].groupKind
  const grouped = original.multiMode === "grouped" || waitingMultiIds.length > 0 || (multiGroups.length > 0 && !legacyUnchanged)
  return { duos, multi: grouped ? waitingMultiIds.length ? { key: "waiting-multi", memberIds: waitingMultiIds, bestSlot: null } : null : legacyUnchanged ? structuredClone(original.multi) : null,
    ...(grouped ? { multiMode: "grouped", multiGroups } : {}), waitingDuoIds,
    brokenPairs: original.brokenPairs.filter((pair) => pair.memberIds.every((id) => waitingDuoIds.includes(id))).map((pair) => structuredClone(pair)),
    unmatchedIds: assignments.filter((item) => item.pool === "未匹配").map((item) => item.memberId),
    ...(Object.hasOwn(original, "unmatchedMessage") ? { unmatchedMessage: original.unmatchedMessage } : {}) }
}

/** Read-only full-plan validation. It never reruns automatic matching or writes a result. */
export function previewBoardCsvText(input: { sessionId: string; revision: string; draft: BoardDraft; people: readonly BoardCsvPerson[]; context: BoardContext; csvText: string }, signingKey: string): BoardCsvPreviewResult {
  try {
    validateBoardStructure(input.context, input.draft)
    const read = readBoardCsvAssignments(input, signingKey)
    if (read.errors.length || !read.assignments) return { error: "CSV未通过校验，请修正后重新上传。", errors: read.errors, ...(read.stale ? { stale: true } : {}) }
    const collected = collectGroups(read.assignments)
    if (collected.errors.length) return { error: "CSV分组信息不完整。", errors: collected.errors }
    const byMember = new Map(input.context.engine.idMap), candidates = new Map(input.context.engine.candidates.map((member) => [byMember.get(member.submissionId) ?? member.submissionId, member]))
    const prefs = Object.fromEntries([...candidates].map(([id, member]) => [id, { availability: member.availability }]))
    const names = new Map(input.people.map((person) => [person.id, person.name])), errors: BoardCsvIssue[] = [], warnings: string[] = [...(read.warnings ?? [])]
    for (const group of collected.groups) {
      const info = { row: group.row, group: group.code, member: group.ids.map((id) => names.get(id)).join("、") }
      const times = getBoardTimeOptions(group.ids, prefs, group.slot)
      if (!times.complete || !times.currentValid) { errors.push({ ...info, message: "该组推荐日期和时段不是全组当前共同可用时间，请调整。" }); continue }
      const members = group.ids.map((id) => candidates.get(id)!)
      const relations = new Map(input.context.engine.pairRelations)
      const inspection = group.pool === "双人"
        ? checkHardConstraints(members[0], members[1], input.context.engine.config, relations)
        : checkGroupConstraints(members[0], members.slice(1), input.context.engine.config, relations)
      const reasons = [...inspection.reasons, ...(group.pool === "双人" && members.some((member) => member.gameTypePref === "多人") ? ["选择了多人的成员不能加入双人结果"] : [])]
      if (reasons.length) errors.push({ ...info, message: [...new Set(reasons)].join("；") })
      if (group.pool === "多人" && (group.ids.length < 4 || group.ids.length > 6)) warnings.push(`多人组${group.code}当前${group.ids.length}人，超出推荐4–6人范围；人工安排可以保留。`)
    }
    for (const item of read.assignments.filter((entry) => entry.pool === "双人" && !entry.groupCode)) {
      const candidate = candidates.get(item.memberId)
      if (!candidate || candidate.gameTypePref === "多人") errors.push({ row: item.row, member: names.get(item.memberId), message: "此玩家当前不符合双人池资格，请放回未匹配池或选择合适安排。" })
    }
    for (const item of read.assignments.filter((entry) => entry.pool === "多人" && !entry.groupCode)) {
      const candidate = candidates.get(item.memberId)
      if (!candidate || candidate.gameTypePref === "双人") errors.push({ row: item.row, member: names.get(item.memberId), message: "此玩家当前不符合多人候选资格，请放回未匹配池或选择合适安排。" })
    }
    for (const item of read.assignments) if (input.context.lockedMemberIds?.includes(item.memberId) && item.pool !== "双人") errors.push({ row: item.row, member: names.get(item.memberId), group: item.groupCode || undefined, message: "此玩家已锁定在双人池，请先在后台解锁后再调整。" })
    if (errors.length) return { error: "CSV未通过共同时间或匹配条件检查。", errors }
    const next = buildDraft(input.draft, read.assignments, collected.groups)
    const diff = summary(input.draft, next, input.people)
    const beforeMembers = membership(input.draft), afterMembers = membership(next)
    for (const row of input.context.originalRows.filter((entry) => entry.status === "locked" || (!entry.group_members?.length && [entry.member_a_id, entry.member_b_id].every((id) => !!id && input.context.lockedMemberIds?.includes(id))))) {
      const ids = row.group_members?.length ? row.group_members : [row.member_a_id, row.member_b_id!]
      if (ids.some((id) => beforeMembers.get(id)?.signature !== afterMembers.get(id)?.signature)) {
        const first = read.assignments.find((entry) => ids.includes(entry.memberId))
        errors.push({ row: first?.row, group: first?.groupCode || undefined, member: ids.map((id) => names.get(id)).join("、"), message: "该配对或小组已锁定，请先在后台解除相应锁定后再调整。" })
      }
    }
    if (errors.length) return { error: "CSV包含锁定结果的调整。", errors }
    const unchanged = diff.changes.length === 0
    // Preserve all original structure/IDs/order/metadata on a no-op, including
    // legacy pools and grey-line references. CSV labels are not result IDs.
    const evaluation = evaluateBoard(input.context, unchanged ? input.draft : next, true)
    if (evaluation.draft.multiMode === "grouped" && evaluation.draft.multi?.memberIds.length) warnings.push(`仍有${evaluation.draft.multi.memberIds.length}人等待多人分组；保存草稿后仍须完成安排或移至未匹配池才能发布。`)
    return { success: true, warnings, preview: { draft: evaluation.draft, rows: evaluation.rows, revisionToken: input.revision, unchanged, ...diff } }
  } catch (error) {
    return { error: error instanceof Error && /[\u3400-\u9fff]/u.test(error.message) ? error.message : "暂时无法核验CSV，请重新下载模板后重试。", errors: [{ message: error instanceof Error && /[\u3400-\u9fff]/u.test(error.message) ? error.message : "方案未通过完整匹配校验。" }] }
  }
}
