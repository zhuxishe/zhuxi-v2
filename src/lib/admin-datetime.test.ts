import { afterEach, describe, expect, it, vi } from "vitest"
import { formatAdminDate, formatAdminDateTime, formatAdminTimestampField } from "./admin-datetime"

afterEach(() => vi.unstubAllEnvs())

describe("admin Japan time display", () => {
  it.each(["UTC", "America/Los_Angeles", "Asia/Tokyo"])("does not depend on the host timezone (%s)", (timezone) => {
    vi.stubEnv("TZ", timezone)
    expect(formatAdminDateTime("2026-04-13T01:07:03.536848+00:00")).toBe("2026-04-13 10:07")
    expect(formatAdminDateTime("2026-07-17T15:31:59+09:00")).toBe("2026-07-17 15:31")
  })

  it("handles midnight and year rollover without displaying hour 24", () => {
    expect(formatAdminDateTime("2026-07-16T15:00:00Z")).toBe("2026-07-17 00:00")
    expect(formatAdminDateTime("2026-12-31T16:31:00Z")).toBe("2027-01-01 01:31")
    expect(formatAdminDate("2026-07-16T15:31:00Z")).toBe("2026-07-17")
    expect(formatAdminDate("2026-07-17")).toBe("2026-07-17")
  })

  it("keeps missing and invalid timestamps readable", () => {
    for (const value of [null, undefined, "", "invalid"]) {
      expect(formatAdminDateTime(value)).toBe("—")
      expect(formatAdminDateTime(value, "未填写")).toBe("未填写")
      expect(formatAdminDate(value, "未记录")).toBe("未记录")
    }
  })

  it("preserves dates and free text when formatting record fields", () => {
    const timestamp = "2026-07-17T06:31:00Z"
    expect(formatAdminTimestampField("created_at", timestamp)).toBe("2026-07-17 15:31")
    expect(formatAdminTimestampField("createdAt", timestamp)).toBe("2026-07-17 15:31")
    expect(formatAdminTimestampField("message", timestamp)).toBe(timestamp)
    expect(formatAdminTimestampField("played_at", "2026-07-17")).toBe("2026-07-17")
    expect(formatAdminTimestampField("created_at", "invalid")).toBe("invalid")
  })
})
