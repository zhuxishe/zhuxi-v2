const TOKYO_OFFSET = "+09:00"

export function formatTokyoDateTimeLocal(value?: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const byType = new Map(parts.map((part) => [part.type, part.value]))

  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}T${byType.get("hour")}:${byType.get("minute")}`
}

export function parseTokyoDateTimeLocal(value?: string): string {
  if (!value) return ""
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value

  const date = new Date(`${value}:00${TOKYO_OFFSET}`)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

export function formatTokyoDateTimeRange(
  startValue: string | null,
  endValue: string | null,
  locale: string,
  fallback: string,
): string {
  if (!startValue) return fallback
  const start = new Date(startValue)
  if (Number.isNaN(start.getTime())) return fallback

  const language = locale === "ja" ? "ja-JP" : "zh-CN"
  const dateFormatter = new Intl.DateTimeFormat(language, {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  const timeFormatter = new Intl.DateTimeFormat(language, {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })

  if (!endValue) return `${dateFormatter.format(start)} ${timeFormatter.format(start)}`
  const end = new Date(endValue)
  if (Number.isNaN(end.getTime())) return `${dateFormatter.format(start)} ${timeFormatter.format(start)}`

  const startDay = formatTokyoDateTimeLocal(start.toISOString()).slice(0, 10)
  const endDay = formatTokyoDateTimeLocal(end.toISOString()).slice(0, 10)
  if (startDay === endDay) {
    return `${dateFormatter.format(start)} ${timeFormatter.format(start)}–${timeFormatter.format(end)}`
  }
  return `${dateFormatter.format(start)} ${timeFormatter.format(start)} – ${dateFormatter.format(end)} ${timeFormatter.format(end)}`
}
