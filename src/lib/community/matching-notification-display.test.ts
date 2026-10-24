import { describe, expect, it } from "vitest"
import { matchingNotificationCopy, matchingNotificationUnavailableCopy } from "./matching-notification-display"

const round = { round_name: "秋季活动", title_ja: " 秋のイベント " }

describe("matching notices shown to players", () => {
  it.each(["matching_submitted", "matching_published", "matching_unmatched", "matching_withdrawn", "matching_cancelled"])("uses the public localized round title for %s", (type) => {
    expect(matchingNotificationCopy(type, "zh", round)?.body).toContain("秋季活动")
    expect(matchingNotificationCopy(type, "ja", round)?.body).toContain("秋のイベント")
    expect(matchingNotificationCopy(type, "ja", { ...round, title_ja: " " })?.body).toContain("秋季活动")
    expect(matchingNotificationCopy(type, "zh")?.body).not.toContain("undefined")
  })

  it("does not normalize unrelated account or community receipts", () => {
    expect(matchingNotificationCopy("registration_submitted", "zh", round)).toBeNull()
    expect(matchingNotificationCopy("comment_like", "ja", round)).toBeNull()
    expect(matchingNotificationCopy("toString", "zh", round)).toBeNull()
  })

  it("keeps the public activity title literal when it contains replacement characters", () => {
    const title = "春季 $& / $' 活动"
    expect(matchingNotificationCopy("matching_submitted", "zh", { round_name: title, title_ja: null })?.body)
      .toContain(title)
  })

  it.each(["zh", "ja"] as const)("keeps obsolete publication notices clear without exposing versions in %s", (locale) => {
    expect(matchingNotificationUnavailableCopy(locale, "stale").body).not.toMatch(/版本|公開版|バージョン/)
    expect(matchingNotificationUnavailableCopy(locale, "cancelled").body).toMatch(locale === "ja" ? /キャンセル/ : /已取消/)
  })
})
