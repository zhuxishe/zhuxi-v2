/** Birthdays are date-only values; never interpret them in the browser's time zone. */
export const MIN_BIRTH_DATE = "1900-01-01"

export function getTodayInTokyo(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now)
  const part = (type: string) => parts.find((item) => item.type === type)!.value
  return `${part("year")}-${part("month")}-${part("day")}`
}

export function parseBirthDate(value: unknown): { year: number; month: number; day: number } | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < MIN_BIRTH_DATE) return null
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? { year, month, day }
    : null
}

export function isValidBirthDate(value: unknown, today = getTodayInTokyo()): value is string {
  return parseBirthDate(value) !== null && (value as string) <= today
}

export function ageRangeFromBirthDate(value: unknown, today = getTodayInTokyo()): string | null {
  if (!isValidBirthDate(value, today)) return null
  const birth = parseBirthDate(value)!
  const current = parseBirthDate(today)
  if (!current) return null
  const age = current.year - birth.year - (
    current.month < birth.month || (current.month === birth.month && current.day < birth.day) ? 1 : 0
  )
  if (age < 18) return "18以下"
  if (age < 21) return "18-20"
  if (age < 24) return "21-23"
  if (age < 27) return "24-26"
  if (age < 30) return "27-29"
  return "30+"
}
