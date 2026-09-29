import { describe, expect, it } from "vitest"
import { formatMemberValue } from "./member-center-utils"

const timestamp = "2026-04-13T01:07:03.536848+00:00"

describe("member detail timestamp display", () => {
  it.each([
    "created_at", "updated_at", "auth_created_at", "auth_last_sign_in_at",
    "account_linked_at", "anonymized_at", "last_profile_saved_at", "submitted_at",
    "verified_at", "completed_at", "assigned_at", "revoked_at", "joined_at",
  ])("formats %s in Japan time", (field) => {
    expect(formatMemberValue(timestamp, field)).toBe("2026-04-13 10:07")
  })

  it("formats nested read-only records without modifying source data", () => {
    const record = { account: { created_at: timestamp }, note: timestamp, played_at: "2026-04-13" }
    const expected = { account: { created_at: "2026-04-13 10:07" }, note: timestamp, played_at: "2026-04-13" }
    expect(JSON.parse(formatMemberValue(record))).toEqual(expected)
    expect(JSON.parse(formatMemberValue([record]))).toEqual(expected)
    expect(record.account.created_at).toBe(timestamp)
  })

  it("retains date-only fields, user-entered text, and empty-value labels", () => {
    expect(formatMemberValue("2026-07-17", "played_at")).toBe("2026-07-17")
    expect(formatMemberValue(timestamp, "notes")).toBe(timestamp)
    expect(formatMemberValue(timestamp)).toBe(timestamp)
    expect(formatMemberValue(null, "created_at")).toBe("未填写")
    expect(formatMemberValue("", "created_at")).toBe("空文本")
  })
})
