import { afterEach, describe, expect, it } from "vitest"
import { formatPublishedMatchSlot, publishedMatchTitle, publishedMultiGroupTitle } from "./publication-display"

const originalTimeZone = process.env.TZ
afterEach(() => { process.env.TZ = originalTimeZone })

describe("saved matching recommendations", () => {
  it("formats real group ordinals and never treats missing numbers as group size", () => {
    expect(publishedMultiGroupTitle(1)).toBe("多人组01")
    expect(publishedMultiGroupTitle(2)).toBe("多人组02")
    expect(publishedMultiGroupTitle(100)).toBe("多人组100")
    for (const value of [undefined, null, 0, -1, NaN, 1.5, "2"]) expect(publishedMultiGroupTitle(value)).toBe("多人组")
  })
  it.each(["Asia/Tokyo", "America/Los_Angeles", "Europe/London"])("preserves the saved day in %s", (zone) => {
    process.env.TZ = zone
    expect(formatPublishedMatchSlot("2026-11-03_晚上", "zh-CN")).toMatch(/2026\/11\/3.*晚上/)
    expect(formatPublishedMatchSlot("2026-03-08_上午", "ja-JP")).toMatch(/2026\/3\/8.*午前/)
  })
  it.each([null, "", "2026-02-30_晚上", "2026-11-03_unknown", "2026-11-03", { date: "2026-11-03" }])("does not invent a recommendation for %s", (value) => {
    expect(formatPublishedMatchSlot(value, "zh")).toBeNull()
  })
  it("shows the public round title without the internal session name", () => {
    expect(publishedMatchTitle({ session_name: "第一批", round: { round_name: "秋季" } })).toBe("秋季")
    expect(publishedMatchTitle({ session_name: "内部第二批", round: [{ round_name: "秋季" }] })).toBe("秋季")
    expect(publishedMatchTitle({ session_name: "历史独立活动", round: null })).toBe("历史独立活动")
    expect(publishedMatchTitle(undefined)).toBe("")
  })
})
