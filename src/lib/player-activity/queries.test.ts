import { beforeEach, describe, expect, it, vi } from "vitest"

const createClient = vi.fn()

vi.mock("@/lib/supabase/server", () => ({ createClient }))

type QueryResponse = {
  data: unknown
  error: { code?: string; message?: string } | null
  count?: number | null
}

function queryResult(response: QueryResponse) {
  const promise = Promise.resolve(response)
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    or: vi.fn(),
    contains: vi.fn(),
    lte: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    range: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    then: promise.then.bind(promise),
  }
  for (const method of [
    query.select,
    query.eq,
    query.is,
    query.in,
    query.or,
    query.contains,
    query.lte,
    query.gte,
    query.order,
    query.limit,
    query.range,
  ]) method.mockReturnValue(query)
  query.single.mockResolvedValue(response)
  query.maybeSingle.mockResolvedValue(response)
  return query
}

function clientFor(query: ReturnType<typeof queryResult>) {
  return { from: vi.fn().mockReturnValue(query) }
}

function settings(overrides: Record<string, unknown> = {}) {
  return {
    large_activities_enabled: true,
    social_scripts_enabled: true,
    script_library_enabled: true,
    large_home_limit: 2,
    social_home_limit: 5,
    ...overrides,
  }
}

function scriptRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "月夜狼袭",
    title_ja: null,
    author: "竹溪社",
    cover_url: null,
    genre_tags: ["推理"],
    player_count_min: 4,
    player_count_max: 6,
    duration_minutes: 120,
    budget: null,
    location: "新宿",
    created_at: "2026-09-01T00:00:00Z",
    is_featured: true,
    is_social_script: true,
    show_on_player_activity: true,
    player_activity_order: 1,
    pin_in_social_library: true,
    social_library_order: 1,
    ...overrides,
  }
}

describe("Player Activity V2 queries", () => {
  beforeEach(() => vi.clearAllMocks())

  it("does not query or render disabled hub modules", async () => {
    const settingsQuery = queryResult({
      data: settings({
        large_activities_enabled: false,
        social_scripts_enabled: false,
        script_library_enabled: false,
      }),
      error: null,
    })
    createClient.mockResolvedValueOnce(clientFor(settingsQuery))

    const { fetchPlayerActivityHub } = await import("./queries")
    const result = await fetchPlayerActivityHub("zh")

    expect(result.largeActivities).toEqual([])
    expect(result.socialScripts).toEqual([])
    expect(result.settings).toMatchObject({
      largeActivitiesEnabled: false,
      socialScriptsEnabled: false,
      scriptLibraryEnabled: false,
    })
    expect(createClient).toHaveBeenCalledTimes(1)
  })

  it("performs full-library filtering, counting and pagination in PostgREST", async () => {
    const settingsQuery = queryResult({ data: settings(), error: null })
    const scriptsQuery = queryResult({ data: [scriptRow()], error: null, count: 49 })
    createClient
      .mockResolvedValueOnce(clientFor(settingsQuery))
      .mockResolvedValueOnce(clientFor(scriptsQuery))

    const { fetchPlayerScriptLibrary, PLAYER_SCRIPT_SUMMARY_COLUMNS } = await import("./queries")
    const result = await fetchPlayerScriptLibrary("zh", {
      search: "狼.(测试)",
      genre: "推理",
      headcount: 5,
      duration: 180,
      sort: "recommended",
      page: 2,
      pageSize: 24,
    })

    expect(scriptsQuery.select).toHaveBeenCalledWith(PLAYER_SCRIPT_SUMMARY_COLUMNS, { count: "exact" })
    expect(PLAYER_SCRIPT_SUMMARY_COLUMNS).not.toMatch(/content_html|pdf_url|page_images/)
    expect(scriptsQuery.eq).toHaveBeenCalledWith("is_player_visible", true)
    expect(scriptsQuery.is).toHaveBeenCalledWith("archived_at", null)
    expect(scriptsQuery.or).toHaveBeenCalledWith(expect.stringContaining("title.ilike.%狼测试%"))
    expect(scriptsQuery.contains).toHaveBeenCalledWith("genre_tags", ["推理"])
    expect(scriptsQuery.lte).toHaveBeenCalledWith("player_count_min", 5)
    expect(scriptsQuery.gte).toHaveBeenCalledWith("player_count_max", 5)
    expect(scriptsQuery.lte).toHaveBeenCalledWith("duration_minutes", 180)
    expect(scriptsQuery.order.mock.calls.slice(-4)).toEqual([
      ["pin_in_social_library", { ascending: false }],
      ["social_library_order", { ascending: true }],
      ["created_at", { ascending: false }],
      ["id", { ascending: true }],
    ])
    expect(scriptsQuery.range).toHaveBeenCalledWith(24, 47)
    expect(result).toMatchObject({ total: 49, page: 2, pageSize: 24, totalPages: 3 })
    expect(result?.items.map((item) => item.id)).toEqual(["11111111-1111-4111-8111-111111111111"])
  })

  it("queries only explicit home recommendations and honors both limits", async () => {
    const settingsQuery = queryResult({
      data: settings({ large_home_limit: 2, social_home_limit: 3 }),
      error: null,
    })
    const largeQuery = queryResult({
      data: [{
        id: "large-1",
        title: "大型活动",
        status: "published",
        show_on_player_home: true,
        player_home_order: 1,
      }],
      error: null,
    })
    const socialQuery = queryResult({ data: [scriptRow()], error: null })
    createClient
      .mockResolvedValueOnce(clientFor(settingsQuery))
      .mockResolvedValueOnce(clientFor(largeQuery))
      .mockResolvedValueOnce(clientFor(socialQuery))

    const { fetchPlayerActivityHub } = await import("./queries")
    const result = await fetchPlayerActivityHub("zh")

    expect(largeQuery.eq).toHaveBeenCalledWith("show_on_player_home", true)
    expect(largeQuery.select.mock.calls[0][0]).not.toContain("cover_aspect_ratio")
    expect(largeQuery.limit).toHaveBeenCalledWith(2)
    expect(socialQuery.eq).toHaveBeenCalledWith("show_on_player_activity", true)
    expect(socialQuery.limit).toHaveBeenCalledWith(3)
    expect(result.largeActivities).toHaveLength(1)
    expect(result.socialScripts).toHaveLength(1)
  })

  it("reads the stored cover ratio for a visible large activity detail", async () => {
    const detail = queryResult({ data: { id: "large-1", title: "大型活动", cover_aspect_ratio: "9:16" }, error: null })
    const dateQuery = queryResult({
      data: [{ id: "latest-in-library", start_at: null, end_at: null, event_date: "2026-07-16" }],
      error: null,
    })
    createClient
      .mockResolvedValueOnce(clientFor(queryResult({ data: settings(), error: null })))
      .mockResolvedValueOnce(clientFor(detail))
      .mockResolvedValueOnce(clientFor(dateQuery))

    const { fetchPlayerLargeActivity } = await import("./queries")
    const result = await fetchPlayerLargeActivity("large-1", "zh", new Date("2026-07-17T12:00:00+09:00"))

    expect(detail.select).toHaveBeenCalledWith(expect.stringContaining("cover_aspect_ratio"))
    expect(detail.eq).toHaveBeenCalledWith("is_player_visible", true)
    expect(detail.is).toHaveBeenCalledWith("archived_at", null)
    expect(result?.coverAspectRatio).toBe("9:16")
    expect(result?.latestActivityId).toBe("latest-in-library")
  })

  it("keeps details available with the portrait default before the ratio migration", async () => {
    const beforeMigration = queryResult({
      data: null,
      error: { code: "42703", message: "column past_event_reviews.cover_aspect_ratio does not exist" },
    })
    const legacyDetail = queryResult({ data: { id: "large-1", title: "旧活动" }, error: null })
    createClient
      .mockResolvedValueOnce(clientFor(queryResult({ data: settings(), error: null })))
      .mockResolvedValueOnce({ from: vi.fn()
        .mockReturnValueOnce(beforeMigration)
        .mockReturnValueOnce(legacyDetail) })
      .mockResolvedValueOnce(clientFor(queryResult({ data: [], error: null })))

    const { fetchPlayerLargeActivity } = await import("./queries")
    const result = await fetchPlayerLargeActivity("large-1", "zh")

    expect(result?.coverAspectRatio).toBe("3:4")
    expect(legacyDetail.select.mock.calls[0][0]).not.toContain("cover_aspect_ratio")
  })

  it("finds the latest badge from all visible activities independently of the menu recommendations", async () => {
    const menuQuery = queryResult({
      data: [{ id: "older-recommendation", title: "活动", status: "published", show_on_player_home: true }],
      error: null,
    })
    const dates = queryResult({
      data: [{ id: "latest-in-library", event_date: "2026-07-16", start_at: null, end_at: null }],
      error: null,
    })
    createClient
      .mockResolvedValueOnce(clientFor(queryResult({ data: settings({ social_scripts_enabled: false }), error: null })))
      .mockResolvedValueOnce(clientFor(menuQuery))
      .mockResolvedValueOnce(clientFor(dates))

    const { fetchPlayerActivityHub } = await import("./queries")
    const result = await fetchPlayerActivityHub("zh", new Date("2026-07-17T12:00:00+09:00"), { includeLatestBadge: true })

    expect(result.largeActivities.map((item) => item.id)).toEqual(["older-recommendation"])
    expect(result.latestActivityId).toBe("latest-in-library")
    expect(dates.eq).toHaveBeenCalledWith("is_player_visible", true)
    expect(dates.eq).toHaveBeenCalledWith("status", "published")
    expect(dates.is).toHaveBeenCalledWith("archived_at", null)
    expect(dates.eq).not.toHaveBeenCalledWith("show_on_player_home", expect.anything())
    expect(dates.range).toHaveBeenCalledWith(0, 499)
  })
})
