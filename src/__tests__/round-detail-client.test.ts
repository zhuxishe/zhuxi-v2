import { describe, expect, it } from "vitest"
import { canRunRoundMatching } from "@/components/admin/round-detail-rules"

describe("canRunRoundMatching", () => {
  it("only allows running matching when the round is closed", () => {
    expect(canRunRoundMatching("draft")).toBe(false)
    expect(canRunRoundMatching("open")).toBe(false)
    expect(canRunRoundMatching("closed")).toBe(true)
    expect(canRunRoundMatching("matched")).toBe(false)
  })
})
