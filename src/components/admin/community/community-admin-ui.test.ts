import { describe, expect, it } from "vitest"
import { formatProtectedMemberNumber } from "./community-admin-ui"

describe("formatProtectedMemberNumber", () => {
  it("shows the value to a permitted administrator", () => {
    expect(formatProtectedMemberNumber("ZXS-001", true)).toBe("ZXS-001")
  })

  it("keeps a real null distinct for a permitted administrator", () => {
    expect(formatProtectedMemberNumber(null, true)).toBe("未编号")
  })

  it("never turns a permission redaction into a real null label", () => {
    expect(formatProtectedMemberNumber("ZXS-001", false)).toBe("权限隐藏")
    expect(formatProtectedMemberNumber(null, false)).toBe("权限隐藏")
  })
})
