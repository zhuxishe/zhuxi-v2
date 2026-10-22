import { describe, expect, it } from "vitest"
import { addCalendarDays, calendarDateRange, calendarWeekday } from "./calendar-date"

describe("activity calendar dates", () => {
  it.each([
    ["2026-10-21", "2026-11-03", 14], // US and European autumn clock changes
    ["2026-03-01", "2026-03-14", 14], // US spring clock change
    ["2026-03-22", "2026-04-04", 14], // European spring clock change
    ["2026-04-01", "2026-04-14", 14], // Australian autumn clock change
    ["2026-10-01", "2026-10-14", 14], // Australian spring clock change
    ["2028-02-28", "2028-03-01", 3],
    ["2026-12-31", "2027-01-01", 2],
    ["2026-10-23", "2026-10-23", 1],
  ])("includes every date once from %s to %s", (start, end, count) => {
    const dates = calendarDateRange(start, end)
    expect(dates).toHaveLength(count)
    expect(new Set(dates).size).toBe(count)
    expect(dates[0]).toBe(start)
    expect(dates.at(-1)).toBe(end)
    for (let index = 0; index < count; index++) {
      expect(dates[index]).toBe(addCalendarDays(start, index))
    }
  })

  it("preserves a continuous fourteen-day window and its weekdays across autumn DST", () => {
    const dates = calendarDateRange("2026-10-21", "2026-11-03")
    expect(dates).toEqual([
      "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25",
      "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30",
      "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03",
    ])
    expect(dates.map(calendarWeekday)).toEqual([3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6, 0, 1, 2])
  })

  it("keeps the matching creation default at start plus thirteen calendar days", () => {
    expect(addCalendarDays("2026-03-01", 13)).toBe("2026-03-14")
    expect(addCalendarDays("2026-10-21", 13)).toBe("2026-11-03")
    expect(addCalendarDays("2026-12-25", 13)).toBe("2027-01-07")
  })

  it("keeps other activity purposes on the selected calendar date", () => {
    expect(addCalendarDays("2026-10-25", 0)).toBe("2026-10-25")
  })

  it("returns no date rows for an empty, invalid or reversed range", () => {
    expect(calendarDateRange("", "")).toEqual([])
    expect(calendarDateRange("2026-02-30", "2026-03-02")).toEqual([])
    expect(calendarDateRange("2026-10-24", "2026-10-23")).toEqual([])
    expect(addCalendarDays("", 13)).toBe("")
  })
})
