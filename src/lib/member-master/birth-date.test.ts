import { describe, expect, it } from "vitest"
import { ageRangeFromBirthDate, getTodayInTokyo, isValidBirthDate, parseBirthDate } from "./birth-date"

describe("date-only birthdays", () => {
  it.each([null, "", "2000-2-02", "2023-02-29", "2000-04-31", "2000-00-10", "1899-12-31", "2000-02-01T00:00:00Z"])("rejects invalid date %j", (value) => {
    expect(parseBirthDate(value)).toBeNull()
  })
  it("keeps leap dates valid and rejects future birthdays", () => {
    expect(parseBirthDate("2000-02-29")).toEqual({ year: 2000, month: 2, day: 29 })
    expect(isValidBirthDate("2026-10-08", "2026-10-07")).toBe(false)
    expect(isValidBirthDate("2026-10-07", "2026-10-07")).toBe(true)
  })
  it("uses the Tokyo calendar day across UTC midnight", () => {
    expect(getTodayInTokyo(new Date("2026-10-06T15:00:00Z"))).toBe("2026-10-07")
    expect(getTodayInTokyo(new Date("2026-10-06T14:59:59Z"))).toBe("2026-10-06")
  })
  it.each([
    ["2008-10-08", "18以下"], ["2008-10-07", "18-20"],
    ["2005-10-08", "18-20"], ["2005-10-07", "21-23"],
    ["2002-10-08", "21-23"], ["2002-10-07", "24-26"],
    ["1999-10-08", "24-26"], ["1999-10-07", "27-29"],
    ["1996-10-08", "27-29"], ["1996-10-07", "30+"],
  ])("computes the age band at birthday boundaries for %s", (birth, expected) => {
    expect(ageRangeFromBirthDate(birth, "2026-10-07")).toBe(expected)
  })
  it("increments February 29 birthdays on March 1 in non-leap years", () => {
    expect(ageRangeFromBirthDate("2004-02-29", "2025-02-28")).toBe("18-20")
    expect(ageRangeFromBirthDate("2004-02-29", "2025-03-01")).toBe("21-23")
  })
})
