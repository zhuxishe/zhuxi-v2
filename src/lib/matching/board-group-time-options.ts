import { getBoardTimeOptions } from "./board-time-options"
import type { BoardSubmissionPreference } from "./board-types"

export interface BoardGroupTimeCandidate {
  slot: string
  memberIds: string[]
  count: number
  /** One-based coverage rank, with calendar order breaking ties. */
  rank: number
}

export interface BoardGroupTimeCandidates {
  /** Missing or malformed availability prevents a reliable coverage ranking. */
  complete: boolean
  candidates: BoardGroupTimeCandidate[]
}

const TIME_ORDER = ["上午", "下午", "晚上"] as const

/**
 * Suggest up to five periods shared by at least three distinct pool members.
 * This is a coverage view, not an allocation: one member can be suggested for
 * several periods. Callers must retain the raw-submission permission guard and
 * validate final group membership separately before saving or publishing.
 */
export function getBoardGroupTimeCandidates(
  memberIds: readonly string[],
  prefs: Readonly<Record<string, Pick<BoardSubmissionPreference, "availability">>>,
): BoardGroupTimeCandidates {
  const bySlot = new Map<string, string[]>()
  for (const memberId of new Set(memberIds)) {
    const availability = getBoardTimeOptions([memberId], prefs, null)
    if (!availability.complete) return { complete: false, candidates: [] }
    for (const slot of availability.commonSlots) {
      const members = bySlot.get(slot) ?? []
      members.push(memberId)
      bySlot.set(slot, members)
    }
  }
  const candidates = [...bySlot]
    .filter(([, ids]) => ids.length >= 3)
    .sort(([slotA, idsA], [slotB, idsB]) => {
      const [dateA, timeA] = slotA.split("_")
      const [dateB, timeB] = slotB.split("_")
      return idsB.length - idsA.length
        || dateA.localeCompare(dateB)
        || TIME_ORDER.indexOf(timeA as typeof TIME_ORDER[number]) - TIME_ORDER.indexOf(timeB as typeof TIME_ORDER[number])
    })
    .slice(0, 5)
    .map(([slot, ids], index) => ({ slot, memberIds: ids, count: ids.length, rank: index + 1 }))
  return { complete: true, candidates }
}
