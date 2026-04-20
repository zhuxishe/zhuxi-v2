import { describe, expect, it } from "vitest"
import { canRunRoundMatching, canUpdateRoundStatus } from "@/components/admin/round-detail-rules"

describe("canRunRoundMatching", () => {
  it("only allows running matching when the round is closed", () => {
    expect(canRunRoundMatching("draft")).toBe(false)
    expect(canRunRoundMatching("open")).toBe(false)
    expect(canRunRoundMatching("closed")).toBe(true)
    expect(canRunRoundMatching("matched")).toBe(false)
  })
})

describe("canUpdateRoundStatus", () => {
  it("prevents matched rounds from being downgraded or manually set", () => {
    expect(canUpdateRoundStatus("draft", "open")).toBe(true)
    expect(canUpdateRoundStatus("open", "closed")).toBe(true)
    expect(canUpdateRoundStatus("closed", "draft")).toBe(true)
    expect(canUpdateRoundStatus("closed", "matched")).toBe(false)
    expect(canUpdateRoundStatus("matched", "draft")).toBe(false)
    expect(canUpdateRoundStatus("matched", "open")).toBe(false)
    expect(canUpdateRoundStatus("matched", "closed")).toBe(false)
  })
})
