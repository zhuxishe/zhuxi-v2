import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))

import { fetchPastEventReviewAdminState } from "./past-event-reviews"

function reviewQueryResult() {
  const response = {
    data: [{
      id: "11111111-1111-4111-8111-111111111111",
      gallery_urls: ["/gallery.webp"],
    }],
    error: null,
    count: 42,
  }
  const query = {
    order: vi.fn(),
    range: vi.fn(),
    not: vi.fn(),
    is: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    then: Promise.resolve(response).then.bind(Promise.resolve(response)),
  }
  query.order.mockReturnValue(query)
  query.range.mockReturnValue(query)
  query.not.mockReturnValue(query)
  query.is.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.or.mockReturnValue(query)
  return query
}

describe("fetchPastEventReviewAdminState", () => {
  beforeEach(() => vi.clearAllMocks())

  it("applies archive, status, sanitized search, and server pagination filters", async () => {
    const reviewQuery = reviewQueryResult()
    const reviewSelect = vi.fn().mockReturnValue(reviewQuery)
    const settingsMaybeSingle = vi.fn().mockResolvedValue({ data: { id: 1 }, error: null })
    const settingsChain = {
      eq: vi.fn(),
      maybeSingle: settingsMaybeSingle,
    }
    settingsChain.eq.mockReturnValue(settingsChain)
    const settingsSelect = vi.fn().mockReturnValue(settingsChain)
    const from = vi.fn((table: string) => table === "past_event_reviews"
      ? { select: reviewSelect }
      : { select: settingsSelect })
    mocks.createAdminClient.mockReturnValue({ from })

    const result = await fetchPastEventReviewAdminState({
      archived: true,
      status: "cancelled",
      search: "危险,.(搜索)",
      page: 2,
      pageSize: 20,
    })

    expect(reviewSelect).toHaveBeenCalledWith("*", { count: "exact" })
    expect(reviewQuery.range).toHaveBeenCalledWith(20, 39)
    expect(reviewQuery.not).toHaveBeenCalledWith("archived_at", "is", null)
    expect(reviewQuery.eq).toHaveBeenCalledWith("status", "cancelled")
    expect(reviewQuery.or).toHaveBeenCalledWith(expect.stringContaining("%危险搜索%"))
    expect(reviewQuery.or.mock.calls[0][0]).not.toContain("危险,.(搜索)")
    expect(result).toMatchObject({ total: 42, page: 2, pageSize: 20, setupRequired: false })
    expect(result.reviews[0].gallery_urls).toEqual(["/gallery.webp"])
  })

  it("uses the current-content filter and safe pagination defaults", async () => {
    const reviewQuery = reviewQueryResult()
    const settingsChain = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 1 }, error: null }),
    }
    settingsChain.eq.mockReturnValue(settingsChain)
    const from = vi.fn((table: string) => table === "past_event_reviews"
      ? { select: vi.fn().mockReturnValue(reviewQuery) }
      : { select: vi.fn().mockReturnValue(settingsChain) })
    mocks.createAdminClient.mockReturnValue({ from })

    await fetchPastEventReviewAdminState({ page: -5, pageSize: 999 })

    expect(reviewQuery.range).toHaveBeenCalledWith(0, 99)
    expect(reviewQuery.is).toHaveBeenCalledWith("archived_at", null)
  })
})
