import { formatTokyoDateTimeLocal } from "@/lib/player-activity/tokyo-datetime"

/** Display only: keep stored timestamps and datetime-local input values unchanged. */
export function formatAdminDateTime(value: string | null | undefined, fallback = "—"): string {
  return formatTokyoDateTimeLocal(value).replace("T", " ") || fallback
}

export function formatAdminDate(value: string | null | undefined, fallback = "—"): string {
  return formatTokyoDateTimeLocal(value).slice(0, 10) || fallback
}

/** Format named timestamp fields in read-only records; preserve dates and free text. */
export function formatAdminTimestampField(key: string, value: unknown): unknown {
  if (typeof value !== "string" || !/(?:_at|At)$/.test(key)
    || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) return value
  return formatAdminDateTime(value, value)
}
