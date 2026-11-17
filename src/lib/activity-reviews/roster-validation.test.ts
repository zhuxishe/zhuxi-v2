import { describe, expect, it } from "vitest"
import { validateReviewRoster } from "./validation"

const roundId = "11111111-1111-4111-8111-111111111111"
const memberId = "22222222-2222-4222-8222-222222222222"
const input = { roundId, memberIds: [] as string[], expectedVersion: 2, reason: "核实实际参与名单" }

describe("versioned roster validation", () => {
  it("preserves the legacy minimum while allowing verified unified empty and solo rosters", () => {
    for (const memberIds of [[], [memberId]]) {
      expect(validateReviewRoster({ ...input, memberIds })).toBe("PEER_INVALID_INPUT")
      expect(validateReviewRoster({ ...input, memberIds }, true)).toBeNull()
    }
  })
  it("retains identifiers, version, reason and duplicate guards in unified mode", () => {
    for (const invalid of [{ ...input, roundId: "bad" }, { ...input, memberIds: [memberId, memberId] },
      { ...input, memberIds: ["bad"] }, { ...input, expectedVersion: -1 }]) {
      expect(validateReviewRoster(invalid, true)).toBe("PEER_INVALID_INPUT")
    }
    expect(validateReviewRoster({ ...input, reason: "" }, true)).toBe("PEER_REASON_REQUIRED")
  })
})
