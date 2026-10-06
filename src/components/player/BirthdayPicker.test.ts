import { describe, expect, it } from "vitest"
import {
  birthdayDaysInMonth,
  clampBirthdaySelection,
  formatBirthdaySelection,
  initialBirthdaySelection,
} from "./BirthdayPicker.utils"

describe("birthday picker calendar selection", () => {
  const today = "2026-10-07"

  it("preserves a saved leap-day birthday when reopening", () => {
    expect(initialBirthdaySelection("2004-02-29", today)).toEqual({ year: 2004, month: 2, day: 29 })
  })

  it("clamps the day when changing to a shorter month or non-leap year", () => {
    expect(clampBirthdaySelection({ year: 2004, month: 2, day: 31 }, today)).toEqual({ year: 2004, month: 2, day: 29 })
    expect(clampBirthdaySelection({ year: 2005, month: 2, day: 29 }, today)).toEqual({ year: 2005, month: 2, day: 28 })
    expect(clampBirthdaySelection({ year: 2005, month: 4, day: 31 }, today)).toEqual({ year: 2005, month: 4, day: 30 })
    expect(birthdayDaysInMonth(1900, 2)).toBe(28)
    expect(birthdayDaysInMonth(2000, 2)).toBe(29)
  })

  it("clamps all three wheels so a future date cannot be selected", () => {
    expect(clampBirthdaySelection({ year: 2027, month: 12, day: 31 }, today)).toEqual({ year: 2026, month: 10, day: 7 })
    expect(clampBirthdaySelection({ year: 2026, month: 9, day: 30 }, today)).toEqual({ year: 2026, month: 9, day: 30 })
    expect(clampBirthdaySelection({ year: 1899, month: 1, day: 1 }, today)).toEqual({ year: 1900, month: 1, day: 1 })
  })

  it("uses a safe initial position for empty or invalid legacy values", () => {
    for (const value of ["", "20-24", "2004-02-30", "2027-01-01"]) {
      expect(initialBirthdaySelection(value, today)).toEqual({ year: 2004, month: 1, day: 1 })
    }
  })

  it("commits date-only strings without time-zone conversion", () => {
    expect(formatBirthdaySelection({ year: 2004, month: 2, day: 9 })).toBe("2004-02-09")
  })
})
