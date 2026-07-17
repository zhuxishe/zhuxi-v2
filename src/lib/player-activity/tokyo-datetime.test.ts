import { describe, expect, it } from "vitest"
import {
  formatTokyoDateTimeLocal,
  formatTokyoDateTimeRange,
  parseTokyoDateTimeLocal,
} from "./tokyo-datetime"

describe("Tokyo activity datetime", () => {
  it("formats stored timestamps as deterministic Japan-local form values", () => {
    expect(formatTokyoDateTimeLocal("2026-07-17T10:30:00.000Z")).toBe("2026-07-17T19:30")
  })

  it("parses Japan-local form values without depending on the browser timezone", () => {
    expect(parseTokyoDateTimeLocal("2026-07-17T19:30")).toBe("2026-07-17T10:30:00.000Z")
  })

  it("round-trips without shifting an unchanged activity time", () => {
    const stored = "2026-12-03T01:05:00.000Z"
    expect(parseTokyoDateTimeLocal(formatTokyoDateTimeLocal(stored))).toBe(stored)
  })

  it("formats a complete same-day activity range in Japan time", () => {
    expect(formatTokyoDateTimeRange(
      "2026-07-18T05:00:00.000Z",
      "2026-07-18T08:30:00.000Z",
      "zh",
      "待定",
    )).toBe("2026年7月18日 14:00–17:30")
  })
})
