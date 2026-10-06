import { isValidBirthDate, parseBirthDate } from "@/lib/member-master/birth-date"

export interface BirthdaySelection {
  year: number
  month: number
  day: number
}

export function birthdayDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function clampBirthdaySelection(selection: BirthdaySelection, today: string): BirthdaySelection {
  const current = parseBirthDate(today)!
  const year = Math.max(1900, Math.min(selection.year, current.year))
  const month = Math.max(1, Math.min(selection.month, year === current.year ? current.month : 12))
  const maxDay = year === current.year && month === current.month
    ? current.day
    : birthdayDaysInMonth(year, month)
  return { year, month, day: Math.max(1, Math.min(selection.day, maxDay)) }
}

export function initialBirthdaySelection(value: string, today: string): BirthdaySelection {
  if (isValidBirthDate(value, today)) return parseBirthDate(value)!
  // An initial wheel position is only a suggestion; opening/cancelling never
  // writes it to the form. The user must explicitly confirm their birthday.
  return clampBirthdaySelection({ year: parseBirthDate(today)!.year - 22, month: 1, day: 1 }, today)
}

export function formatBirthdaySelection({ year, month, day }: BirthdaySelection): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}
