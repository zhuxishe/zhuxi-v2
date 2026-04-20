import { describe, expect, it } from "vitest"
import { formatAvailabilityEntries } from "@/components/admin/player-info-format"

describe("formatAvailabilityEntries", () => {
  it("returns every available day instead of truncating after three entries", () => {
    const entries = formatAvailabilityEntries({
      "2026-04-21": ["上午"],
      "2026-04-22": ["下午"],
      "2026-04-23": ["晚上"],
      "2026-04-24": ["上午", "晚上"],
    })

    expect(entries).toEqual([
      "04-21 上午",
      "04-22 下午",
      "04-23 晚上",
      "04-24 上午、晚上",
    ])
  })
})
