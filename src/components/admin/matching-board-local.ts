import type { BoardDraft } from "@/lib/matching/board-types"

export function splitBoardDuo(draft: BoardDraft, key: string): BoardDraft {
  const duo = draft.duos.find((row) => row.key === key)
  if (!duo) return draft
  return { ...draft, duos: draft.duos.filter((row) => row.key !== key),
    waitingDuoIds: [...draft.waitingDuoIds, ...duo.memberIds],
    brokenPairs: [...draft.brokenPairs, { key, memberIds: duo.memberIds }] }
}

/** Moving one person never drags their former partner along. */
export function moveBoardMember(draft: BoardDraft, id: string, target: "duo" | "unmatched"): BoardDraft {
  if (draft.duos.some((duo) => duo.memberIds.includes(id))) throw new Error("请先取消原配对，再移动成员")
  const source = [...draft.waitingDuoIds, ...draft.unmatchedIds, ...(draft.multi?.memberIds ?? [])]
  if (!source.includes(id)) throw new Error("该成员不在当前方案中")
  if ((target === "duo" ? draft.waitingDuoIds : draft.unmatchedIds).includes(id)) return draft
  const remaining = draft.multi?.memberIds.filter((member) => member !== id) ?? []
  return { ...draft,
    multi: draft.multi ? remaining.length ? { ...draft.multi, memberIds: remaining } : null : null,
    waitingDuoIds: [...draft.waitingDuoIds.filter((member) => member !== id), ...(target === "duo" ? [id] : [])],
    unmatchedIds: [...draft.unmatchedIds.filter((member) => member !== id), ...(target === "unmatched" ? [id] : [])],
    brokenPairs: draft.brokenPairs.filter((pair) => !pair.memberIds.includes(id)),
  }
}

export function boardMatchedCount(draft: BoardDraft): number {
  return draft.duos.length * 2 + ((draft.multi?.memberIds.length ?? 0) >= 3 ? draft.multi!.memberIds.length : 0)
}
