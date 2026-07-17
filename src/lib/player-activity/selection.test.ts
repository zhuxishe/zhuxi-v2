import { describe, expect, it } from "vitest"
import {
  buildLargeActivitySections,
  buildSocialScriptSections,
  filterPlayerScripts,
  isUpcomingLargeActivity,
  mapLargeActivityRow,
  mapPlayerScriptRow,
  selectLargeActivitiesForHome,
  sortSocialScriptsForHome,
} from "./selection"
import type { LargeActivitySummary, PlayerScriptSummary } from "./types"

const NOW = new Date("2026-07-17T12:00:00+09:00")

function activity(overrides: Partial<LargeActivitySummary> = {}): LargeActivitySummary {
  return {
    id: "activity-default",
    sourceKey: null,
    title: "活动",
    summary: "",
    content: null,
    coverUrl: null,
    galleryUrls: [],
    startAt: "2026-07-20T10:00:00+09:00",
    endAt: null,
    eventDate: "2026-07-20",
    location: null,
    feeNote: null,
    capacityNote: null,
    registrationUrl: null,
    status: "published",
    tags: [],
    showOnPlayerHome: false,
    playerHomeOrder: 9999,
    pinInPlayerLibrary: false,
    playerLibraryOrder: 9999,
    createdAt: "2026-07-01T00:00:00Z",
    ...overrides,
  }
}

function script(overrides: Partial<PlayerScriptSummary> = {}): PlayerScriptSummary {
  return {
    id: "script-default",
    title: "猫鼠游戏",
    author: null,
    coverUrl: null,
    genreTags: ["欢乐"],
    playerCountMin: 4,
    playerCountMax: 6,
    durationMinutes: 120,
    budget: null,
    location: "新宿",
    createdAt: "2026-07-01T00:00:00Z",
    isFeatured: false,
    isSocialScript: true,
    showOnPlayerActivity: false,
    playerActivityOrder: 9999,
    pinInSocialLibrary: false,
    socialLibraryOrder: 9999,
    ...overrides,
  }
}

describe("Player activity adapters", () => {
  it("falls back to legacy event fields before the activity migration", () => {
    const mapped = mapLargeActivityRow({
      id: "legacy",
      title: "旧活动",
      summary: "简介",
      event_date: "2026-07-21",
      is_published: true,
      sort_order: 4,
    }, "ja")

    expect(mapped).toMatchObject({
      id: "legacy",
      title: "旧活动",
      status: "published",
      startAt: "2026-07-21T00:00:00+09:00",
      playerLibraryOrder: 4,
      showOnPlayerHome: false,
    })
  })

  it("uses Japanese content and old featured flags as social fallbacks", () => {
    const mapped = mapPlayerScriptRow({
      id: "social",
      title: "中文",
      title_ja: "日本語",
      genre_tags: [],
      is_featured: true,
    }, "ja")

    expect(mapped).toMatchObject({
      title: "日本語",
      isSocialScript: true,
      showOnPlayerActivity: true,
      pinInSocialLibrary: true,
    })
  })

  it("does not treat every legacy published script as a social script", () => {
    const mapped = mapPlayerScriptRow({
      id: "legacy-standard",
      title: "普通剧本",
      genre_tags: [],
      is_featured: false,
    }, "zh")

    expect(mapped).toMatchObject({
      isSocialScript: false,
      showOnPlayerActivity: false,
      pinInSocialLibrary: false,
    })
  })
})

describe("Player activity selection", () => {
  it("keeps manual parent order first, auto-fills to two, and hides cancelled items", () => {
    const result = selectLargeActivitiesForHome([
      activity({ id: "auto-upcoming", startAt: "2026-07-18T10:00:00+09:00" }),
      activity({ id: "manual-second", showOnPlayerHome: true, playerHomeOrder: 2 }),
      activity({ id: "manual-first", showOnPlayerHome: true, playerHomeOrder: 1 }),
      activity({ id: "cancelled", status: "cancelled", showOnPlayerHome: true, playerHomeOrder: 0 }),
    ], NOW)

    expect(result.map((item) => item.id)).toEqual(["manual-first", "manual-second"])
  })

  it("auto-fills the remaining parent slot after manually selected activities", () => {
    const result = selectLargeActivitiesForHome([
      activity({ id: "manual", showOnPlayerHome: true, playerHomeOrder: 1 }),
      activity({ id: "future-near", startAt: "2026-07-18T10:00:00+09:00" }),
      activity({ id: "future-far", startAt: "2026-08-20T10:00:00+09:00" }),
    ], NOW)

    expect(result.map((item) => item.id)).toEqual(["manual", "future-near"])
  })

  it("treats an activity as current until endAt has passed", () => {
    expect(isUpcomingLargeActivity(activity({
      startAt: "2026-07-16T10:00:00+09:00",
      endAt: "2026-07-17T18:00:00+09:00",
    }), NOW)).toBe(true)
    expect(isUpcomingLargeActivity(activity({
      startAt: "2026-07-16T10:00:00+09:00",
      endAt: "2026-07-17T11:59:00+09:00",
    }), NOW)).toBe(false)
  })

  it("places upcoming before latest and retains cancelled entries in the child library", () => {
    const sections = buildLargeActivitySections([
      activity({ id: "past", startAt: "2026-07-10T10:00:00+09:00" }),
      activity({ id: "future", startAt: "2026-07-20T10:00:00+09:00" }),
      activity({ id: "cancelled", status: "cancelled", startAt: "2026-07-19T10:00:00+09:00" }),
      activity({ id: "draft", status: "draft" }),
    ], NOW)

    expect(sections.upcoming.map((item) => item.id)).toEqual(["cancelled", "future"])
    expect(sections.latest.map((item) => item.id)).toEqual(["past"])
  })
})

describe("Social script presentation", () => {
  it("respects the parent limit and configured ordering", () => {
    const result = sortSocialScriptsForHome([
      script({ id: "second", showOnPlayerActivity: true, playerActivityOrder: 2 }),
      script({ id: "first", showOnPlayerActivity: true, playerActivityOrder: 1 }),
      script({ id: "hidden", showOnPlayerActivity: false }),
    ], 1)
    expect(result.map((item) => item.id)).toEqual(["first"])
  })

  it("auto-fills configured parent slots from the remaining social library", () => {
    const result = sortSocialScriptsForHome([
      script({ id: "manual", showOnPlayerActivity: true, playerActivityOrder: 1 }),
      script({ id: "pinned-fill", pinInSocialLibrary: true, socialLibraryOrder: 2 }),
      script({ id: "regular-fill", createdAt: "2026-07-10T00:00:00Z" }),
      script({ id: "not-social", isSocialScript: false, createdAt: "2026-07-11T00:00:00Z" }),
    ], 3)

    expect(result.map((item) => item.id)).toEqual(["manual", "pinned-fill", "regular-fill"])
  })

  it("does not duplicate pinned scripts in the more section", () => {
    const sections = buildSocialScriptSections([
      script({ id: "pinned", pinInSocialLibrary: true, socialLibraryOrder: 1 }),
      script({ id: "more" }),
    ])
    expect(sections.pinned.map((item) => item.id)).toEqual(["pinned"])
    expect(sections.more.map((item) => item.id)).toEqual(["more"])
  })

  it("filters the full library by search and genre", () => {
    const scripts = [
      script({ id: "cat", title: "猫鼠游戏", genreTags: ["欢乐"] }),
      script({ id: "wolf", title: "月夜狼袭", genreTags: ["推理"] }),
    ]
    expect(filterPlayerScripts(scripts, "狼", "推理").map((item) => item.id)).toEqual(["wolf"])
  })
})
