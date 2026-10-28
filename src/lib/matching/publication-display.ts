import { calendarWeekday } from "@/lib/calendar-date"

export type MatchingPublicationStatus = "matched" | "unmatched" | "waiting" | "withdrawn" | "cancelled"

export interface MatchingPublication {
  round_id: string
  round_name: string
  session_id: string | null
  session_name: string | null
  publication_version: number
  published_at: string | null
  status: MatchingPublicationStatus
  result_id: string | null
}

/** Format a calendar date without shifting it through the viewer's time zone. */
export function formatPublishedMatchDate(value: string, locale: string): string | null {
  if (!Number.isFinite(calendarWeekday(value))) return null
  return new Intl.DateTimeFormat(locale.startsWith("ja") ? "ja-JP" : "zh-CN", {
    year: "numeric", month: "numeric", day: "numeric", weekday: "short", timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`))
}

/** Display the saved recommendation without consulting a member's newer answers. */
export function formatPublishedMatchSlot(value: unknown, locale: string): string | null {
  if (typeof value !== "string") return null
  const match = /^(\d{4}-\d{2}-\d{2})_(上午|下午|晚上)$/.exec(value)
  if (!match || !Number.isFinite(calendarWeekday(match[1]))) return null
  const japanese = locale.startsWith("ja")
  const day = formatPublishedMatchDate(match[1], locale)
  const slot = japanese ? { 上午: "午前", 下午: "午後", 晚上: "夜" }[match[2]] : match[2]
  return `${day} ${slot}`
}

export function publishedMatchTitle(session: Record<string, unknown> | undefined): string {
  const round = (Array.isArray(session?.round) ? session.round[0] : session?.round) as { round_name?: string } | undefined
  const sessionName = typeof session?.session_name === "string" ? session.session_name : ""
  return round?.round_name || sessionName
}
