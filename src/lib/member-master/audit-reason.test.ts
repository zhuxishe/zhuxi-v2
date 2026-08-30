import { describe, expect, it } from "vitest"
import {
  adminAuditReasonIsValid,
  normalizeAdminAuditReason,
} from "./audit-reason"

describe("administrator audit reason", () => {
  it("trims and accepts 4–500 Unicode code points", () => {
    expect(normalizeAdminAuditReason("  匹配人工调整  ")).toEqual({
      ok: true,
      reason: "匹配人工调整",
    })
    expect(adminAuditReasonIsValid("😀😀😀😀")).toBe(true)
    expect(adminAuditReasonIsValid("a".repeat(500))).toBe(true)
  })

  it("rejects missing, short and oversized reasons", () => {
    expect(normalizeAdminAuditReason("   ").ok).toBe(false)
    expect(adminAuditReasonIsValid("不足")).toBe(false)
    expect(adminAuditReasonIsValid("a".repeat(501))).toBe(false)
  })
})
