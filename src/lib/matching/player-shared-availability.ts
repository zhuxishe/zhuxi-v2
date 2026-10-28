import { getBoardTimeOptions } from "./board-time-options"

export interface PlayerSharedAvailability {
  status: "ready" | "unavailable"
  slots: string[]
}

const unavailable = (): PlayerSharedAvailability => ({ status: "unavailable", slots: [] })

/** Server-side projection: never return either person's individual answers. */
export function getPlayerSharedAvailability(
  memberIds: readonly [string, string],
  submissions: unknown,
): PlayerSharedAvailability {
  if (!memberIds[0] || !memberIds[1] || memberIds[0] === memberIds[1]
    || !Array.isArray(submissions) || submissions.length !== 2) return unavailable()
  const prefs: Record<string, { availability?: Record<string, string[]> }> = {}
  for (const value of submissions) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return unavailable()
    const row = value as Record<string, unknown>
    if (typeof row.member_id !== "string" || !memberIds.includes(row.member_id) || Object.hasOwn(prefs, row.member_id)) return unavailable()
    // The shared parser checks the complete date/period structure at runtime.
    prefs[row.member_id] = { availability: row.availability as Record<string, string[]> | undefined }
  }
  const result = getBoardTimeOptions(memberIds, prefs, null)
  return result.complete ? { status: "ready", slots: result.commonSlots } : unavailable()
}
