import { describe, expect, it } from "vitest"
import {
  normalizeLegacyCompatibilityScore,
  normalizeLegacySessionCount,
} from "@/lib/matching/legacy-import-normalize"

describe("legacy import normalize", () => {
  it("rounds compatibility score into DB-safe integer range", () => {
    expect(normalizeLegacyCompatibilityScore(4.1)).toBe(4)
    expect(normalizeLegacyCompatibilityScore("4.666666667")).toBe(5)
    expect(normalizeLegacyCompatibilityScore(-1)).toBe(0)
    expect(normalizeLegacyCompatibilityScore(9)).toBe(5)
    expect(normalizeLegacyCompatibilityScore(null)).toBeNull()
  })

  it("rounds session count into non-negative integer", () => {
    expect(normalizeLegacySessionCount(3)).toBe(3)
    expect(normalizeLegacySessionCount("4.1")).toBe(4)
    expect(normalizeLegacySessionCount(-3)).toBe(0)
    expect(normalizeLegacySessionCount(null)).toBe(0)
  })
})
