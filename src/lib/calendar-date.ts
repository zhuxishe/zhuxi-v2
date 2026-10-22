/** Activity dates are calendar values, not instants in the device's time zone. */
function parseCalendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null
  return date
}

/** Inclusive date range; UTC arithmetic keeps daylight-saving changes irrelevant. */
export function calendarDateRange(start: string, end: string): string[] {
  const date = parseCalendarDate(start)
  const last = parseCalendarDate(end)
  if (!date || !last) return []

  const dates: string[] = []
  while (date <= last) {
    dates.push(date.toISOString().slice(0, 10))
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return dates
}

export function addCalendarDays(value: string, days: number): string {
  const date = parseCalendarDate(value)
  if (!date || !Number.isInteger(days)) return ""
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Sunday = 0, Saturday = 6, matching Date#getDay without local conversion. */
export function calendarWeekday(value: string): number {
  return parseCalendarDate(value)?.getUTCDay() ?? Number.NaN
}
