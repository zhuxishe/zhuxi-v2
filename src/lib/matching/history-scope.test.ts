import { describe, expect, it } from "vitest"
import { isMatchingHistoryInScope } from "./history-scope"

describe("matching history domains", () => {
  it("keeps untagged historical data in the formal domain", () => {
    for (const session of [null, undefined, { round: null }, { round: { is_test: false } }]) {
      expect(isMatchingHistoryInScope(session)).toBe(true)
      expect(isMatchingHistoryInScope(session, { isTestRound: true })).toBe(false)
    }
  })

  it("isolates test rounds in either Supabase relation representation", () => {
    for (const session of [{ round: { is_test: true } }, [{ round: [{ is_test: true }] }]]) {
      expect(isMatchingHistoryInScope(session)).toBe(false)
      expect(isMatchingHistoryInScope(session, { isTestRound: true })).toBe(true)
    }
  })

  it("does not assume an inaccessible linked round is formal history", () => {
    expect(isMatchingHistoryInScope({ round_id: "hidden-round", round: null })).toBe(false)
    expect(isMatchingHistoryInScope({ round_id: "hidden-round", round: null }, { isTestRound: true })).toBe(false)
  })
})
