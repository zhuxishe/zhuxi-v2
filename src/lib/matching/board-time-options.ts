import type { BoardSubmissionPreference } from "./board-types"

export interface BoardTimeOption {
  slot: string
  /** One-based display order, not a score or algorithm ranking. */
  position: number
  current: boolean
}

export interface BoardTimeOptions {
  /** False when a member's availability is missing or malformed. */
  complete: boolean
  currentValid: boolean
  commonSlots: string[]
  orderedSlots: BoardTimeOption[]
}

const TIME_ORDER = ["上午", "下午", "晚上"] as const
const empty = (complete: boolean): BoardTimeOptions => ({ complete, currentValid: false, commonSlots: [], orderedSlots: [] })

function validDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date))
    && new Date(date).toISOString().slice(0, 10) === date
}

function availabilitySlots(availability: unknown): Set<string> | null {
  if (!availability || typeof availability !== "object" || Array.isArray(availability)) return null
  const result = new Set<string>()
  for (const [date, slots] of Object.entries(availability)) {
    if (!validDate(date) || !Array.isArray(slots)
        || slots.some((slot) => !TIME_ORDER.includes(slot))) return null
    for (const slot of slots) result.add(`${date}_${slot}`)
  }
  return result
}

function selectedKey(value: string | null) {
  // Older results can contain a space between the date and period.
  const match = value && /^(\d{4}-\d{2}-\d{2})[ _](上午|下午|晚上)$/.exec(value)
  return match && validDate(match[1]) ? `${match[1]}_${match[2]}` : null
}

/**
 * Display-only intersection of the current multiplayer members' captured answers.
 * Callers must retain the existing raw-submission permission guard. This does not
 * select or change the saved arrangement, or assign algorithm recommendation ranks.
 */
export function getBoardTimeOptions(
  memberIds: readonly string[],
  prefs: Readonly<Record<string, Pick<BoardSubmissionPreference, "availability">>>,
  selectedSlot: string | null,
): BoardTimeOptions {
  if (!memberIds.length) return empty(true)
  const availability: Set<string>[] = []
  for (const memberId of new Set(memberIds)) {
    const slots = availabilitySlots(prefs[memberId]?.availability)
    if (!slots) return empty(false)
    availability.push(slots)
  }
  const selected = selectedKey(selectedSlot)
  const commonSlots = [...availability[0]]
    .filter((slot) => availability.every((slots) => slots.has(slot)))
    .sort((a, b) => {
      if (a === selected) return -1
      if (b === selected) return 1
      const [dateA, timeA] = a.split("_")
      const [dateB, timeB] = b.split("_")
      return dateA.localeCompare(dateB)
        || TIME_ORDER.indexOf(timeA as typeof TIME_ORDER[number]) - TIME_ORDER.indexOf(timeB as typeof TIME_ORDER[number])
    })
  return {
    complete: true,
    currentValid: selected !== null && commonSlots.includes(selected),
    commonSlots,
    orderedSlots: commonSlots.map((slot, index) => ({ slot, position: index + 1, current: slot === selected })),
  }
}
