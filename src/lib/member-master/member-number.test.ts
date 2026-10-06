import { describe, expect, it } from "vitest"
import { normalizeMemberNumber } from "./member-number"

describe("membership number input", () => {
  it("normalizes case and surrounding spaces while keeping a single representation", () => {
    expect(normalizeMemberNumber("  zxs_0001  ")).toBe("ZXS_001")
    expect(normalizeMemberNumber("ZXS_000")).toBe("ZXS_000")
    expect(normalizeMemberNumber("ZXS_1000")).toBe("ZXS_1000")
  })

  it("rejects alternate separators, missing padding and imprecise numeric inputs", () => {
    for (const value of ["ZXS-001", "001", "ZXS_1", "ZXS_01", "ZXS_1.5", "ZXS_-001", "ZXS_１２３", "ZXS_1000000000000000000"]) {
      expect(normalizeMemberNumber(value)).toBeNull()
    }
    expect(normalizeMemberNumber("ZXS_999999999999999999")).toBe("ZXS_999999999999999999")
  })
})
