import { describe, expect, it } from "vitest"
import {
  getLandingEventReviews,
  getLandingEventReviewSourceKeys,
  getLandingScriptEventReviews,
} from "@/lib/landing-activity-photos"
import {
  mergeLandingEventReviews,
  sortLandingEventReviewsByNewestFirst,
} from "@/lib/landing-event-reviews"
import type { PastEventReviewPublic } from "@/lib/queries/past-event-reviews"

function review(
  id: string,
  eventDate: string | null,
  overrides: Partial<PastEventReviewPublic> = {},
): PastEventReviewPublic {
  return {
    id,
    title: `Title ${id}`,
    summary: `Summary ${id}`,
    cover_url: `/images/${id}.webp`,
    gallery_urls: [],
    source_url: null,
    event_date: eventDate,
    ...overrides,
  }
}

describe("mergeLandingEventReviews", () => {
  it("keeps the established static content as the complete fallback", () => {
    const fallback = getLandingEventReviews("zh")

    expect(mergeLandingEventReviews(fallback, [], getLandingEventReviewSourceKeys())).toEqual(
      sortLandingEventReviewsByNewestFirst(fallback),
    )
  })

  it("replaces a migrated static item without duplicating it", () => {
    const fallback = review("red-packet-luck-battle", "2026-06-20", {
      cover_layout: "poster",
      cover_width: 1587,
      cover_height: 2245,
    })
    const migrated = review("11111111-1111-4111-8111-111111111111", "2026-07-01", {
      source_key: "red-packet-luck-battle",
      title: "后台更新后的红包活动",
      summary: "后台更新后的摘要",
      cover_url: "/images/database-cover.webp",
      gallery_urls: ["/images/database-gallery.webp"],
    })

    const result = mergeLandingEventReviews(
      [fallback],
      [migrated],
      { "red-packet-luck-battle": ["red-packet-luck-battle"] },
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: "red-packet-luck-battle",
      source_key: "red-packet-luck-battle",
      title: "后台更新后的红包活动",
      summary: "后台更新后的摘要",
      event_date: "2026-07-01",
      cover_url: "/images/database-cover.webp",
      gallery_urls: ["/images/database-gallery.webp"],
      cover_layout: "poster",
      cover_width: 1587,
      cover_height: 2245,
    })
  })

  it("recognizes the historical image slug as a source-key alias", () => {
    const fallback = review("team-games", "2025-11-15")
    const migrated = review("22222222-2222-4222-8222-222222222222", "2025-11-15", {
      source_key: "team-game",
      title: "后台版鱿鱼游戏",
    })

    const result = mergeLandingEventReviews(
      [fallback],
      [migrated],
      { "team-games": ["team-games", "team-game"] },
    )

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("team-games")
    expect(result[0].title).toBe("后台版鱿鱼游戏")
  })

  it("keeps unmatched static and database rows in the existing newest-first order", () => {
    const staticNewest = review("static-newest", "2026-06-01")
    const staticUndated = review("static-undated", null)
    const databaseNewest = review("database-newest", "2026-07-01")

    expect(mergeLandingEventReviews(
      [staticNewest, staticUndated],
      [databaseNewest],
    ).map((item) => item.id)).toEqual([
      "database-newest",
      "static-newest",
      "static-undated",
    ])
  })

  it("does not resurrect a removed seeded item once the shared catalogue is active", () => {
    const removedFallback = review("removed-static", "2026-06-01")
    const remainingMigrated = review("33333333-3333-4333-8333-333333333333", "2026-05-01", {
      source_key: "remaining-static",
    })

    const result = mergeLandingEventReviews(
      [removedFallback],
      [remainingMigrated],
      { "removed-static": ["removed-static"] },
    )

    expect(result.map((item) => item.id)).toEqual([remainingMigrated.id])
  })

  it("keeps an intentionally empty migrated catalogue empty", () => {
    const fallback = [review("legacy-static", "2026-06-01")]

    expect(mergeLandingEventReviews(fallback, [], {}, true)).toEqual([])
  })
})

describe("landing social-script showcases", () => {
  it("keeps the five public-only showcase cases outside the large-event source map", () => {
    const showcaseIds = getLandingScriptEventReviews("zh").map((item) => item.id)
    const largeEventSourceKeys = getLandingEventReviewSourceKeys()

    expect(showcaseIds).toEqual([
      "asakusa-omamori",
      "kichijoji-trip",
      "daiba-city",
      "hogwarts-trip",
      "maneki-neko",
    ])
    for (const id of showcaseIds) expect(largeEventSourceKeys[id]).toBeUndefined()
  })
})
