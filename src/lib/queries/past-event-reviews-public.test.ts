import { beforeEach, describe, expect, it, vi } from "vitest"

const select = vi.fn()
const from = vi.fn()
const createClient = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}))

type QueryResponse = {
  data: Array<Record<string, unknown>> | null
  error: { code?: string; message?: string } | null
}

function queryResult(response: QueryResponse) {
  const query: {
    eq: ReturnType<typeof vi.fn>
    is: ReturnType<typeof vi.fn>
    order: ReturnType<typeof vi.fn>
    then: Promise<QueryResponse>["then"]
  } = {
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    then: Promise.resolve(response).then.bind(Promise.resolve(response)),
  }
  query.eq.mockReturnValue(query)
  query.is.mockReturnValue(query)
  query.order.mockReturnValue(query)
  return query
}

function databaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "中文标题",
    summary: "中文摘要",
    cover_url: "/cover.webp",
    gallery_urls: ["/gallery.webp", 7],
    source_url: null,
    event_date: "2026-06-20",
    is_published: true,
    sort_order: 0,
    created_at: "2026-06-20T00:00:00Z",
    ...overrides,
  }
}

describe("fetchPublishedPastEventReviews", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    from.mockReturnValue({ select })
    createClient.mockResolvedValue({ from })
  })

  it("reads the shared source key and localized copy when the columns exist", async () => {
    select.mockReturnValueOnce(queryResult({
      data: [databaseRow({
        source_key: "red-packet-luck-battle",
        title_ja: "紅包・豪運王争奪戦",
        summary_ja: "日本語の概要",
      })],
      error: null,
    }))

    const { fetchPublishedPastEventReviews } = await import("@/lib/queries/past-event-reviews")
    const result = await fetchPublishedPastEventReviews("ja")

    expect(select).toHaveBeenCalledTimes(1)
    expect(select.mock.calls[0][0]).toContain("source_key")
    const firstQuery = select.mock.results[0].value
    expect(firstQuery.is).toHaveBeenCalledWith("archived_at", null)
    expect(result).toEqual([{
      id: "11111111-1111-4111-8111-111111111111",
      source_key: "red-packet-luck-battle",
      title: "紅包・豪運王争奪戦",
      summary: "日本語の概要",
      cover_url: "/cover.webp",
      gallery_urls: ["/gallery.webp"],
      source_url: null,
      event_date: "2026-06-20",
    }])
  })

  it("retries the legacy projection when shared columns are not migrated yet", async () => {
    select
      .mockReturnValueOnce(queryResult({
        data: null,
        error: { code: "PGRST204", message: "Could not find the source_key column" },
      }))
      .mockReturnValueOnce(queryResult({ data: [databaseRow()], error: null }))

    const { fetchPublishedPastEventReviews } = await import("@/lib/queries/past-event-reviews")
    const result = await fetchPublishedPastEventReviews("ja")

    expect(select).toHaveBeenCalledTimes(2)
    expect(select.mock.calls[0][0]).toContain("source_key")
    expect(select.mock.calls[1][0]).not.toContain("source_key")
    expect(result[0]).toMatchObject({
      source_key: null,
      title: "中文标题",
      summary: "中文摘要",
    })
  })

  it("returns the static-compatible empty database result for unrelated query failures", async () => {
    select.mockReturnValueOnce(queryResult({
      data: null,
      error: { code: "42501", message: "permission denied" },
    }))

    const { fetchPublishedPastEventReviews } = await import("@/lib/queries/past-event-reviews")

    await expect(fetchPublishedPastEventReviews()).resolves.toEqual([])
    expect(select).toHaveBeenCalledTimes(1)
  })

  it("marks an empty successful shared query as authoritative", async () => {
    select.mockReturnValueOnce(queryResult({ data: [], error: null }))

    const { fetchPublishedPastEventReviewsState } = await import("@/lib/queries/past-event-reviews")

    await expect(fetchPublishedPastEventReviewsState()).resolves.toEqual({
      reviews: [],
      sharedCatalogueReady: true,
    })
  })
})
