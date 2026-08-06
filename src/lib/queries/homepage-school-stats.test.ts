import { beforeEach, describe, expect, it, vi } from "vitest"
import { FALLBACK_HOMEPAGE_SCHOOL_STATS } from "@/lib/homepage-school-stats"

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }))

import {
  fetchHomepageSchoolStats,
  getAdminHomepageSchoolStatsState,
} from "@/lib/queries/homepage-school-stats"

const validRow = {
  total_members: 12,
  total_schools: 3,
  featured_schools: [{ id: "waseda", zh: "早稻田", ja: "早稲田", count: 7 }],
  version: 2,
  published_at: "2026-08-06T04:00:00.000Z",
}

type MockQueryResult = { data: unknown; error: unknown; count?: number | null }

function publicClient(result: MockQueryResult) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  return { from: vi.fn(() => ({ select })) }
}

function thenableBuilder(result: MockQueryResult) {
  const promise = Promise.resolve(result)
  const builder = {
    then: promise.then.bind(promise),
    eq: vi.fn(),
    lt: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(() => promise),
  }
  builder.eq.mockReturnValue(builder)
  builder.lt.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.limit.mockReturnValue(builder)
  return builder
}

function adminClient(
  statsResult: MockQueryResult,
  historyResults: MockQueryResult | MockQueryResult[],
) {
  const historyQueue = Array.isArray(historyResults) ? [...historyResults] : [historyResults]
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => thenableBuilder(
        table === "homepage_school_stats"
          ? statsResult
          : historyQueue.shift() ?? { data: [], error: null },
      )),
    })),
  }
}

describe("fetchHomepageSchoolStats", () => {
  beforeEach(() => { createClientMock.mockReset() })

  it("returns strictly parsed Supabase data", async () => {
    createClientMock.mockResolvedValue(publicClient({ data: validRow, error: null }))
    await expect(fetchHomepageSchoolStats()).resolves.toEqual({
      totalMembers: 12,
      totalSchools: 3,
      featuredSchools: validRow.featured_schools,
      version: 2,
      publishedAt: validRow.published_at,
    })
  })

  it("falls back when createClient throws because the environment is missing", async () => {
    createClientMock.mockImplementation(async () => { throw new Error("Missing Supabase public key") })
    expect(await fetchHomepageSchoolStats()).toEqual(FALLBACK_HOMEPAGE_SCHOOL_STATS)
  })

  it("falls back when the table is missing or the row is invalid", async () => {
    createClientMock.mockResolvedValueOnce(publicClient({
      data: null,
      error: { code: "PGRST205", message: "Could not find homepage_school_stats" },
    }))
    await expect(fetchHomepageSchoolStats()).resolves.toEqual(FALLBACK_HOMEPAGE_SCHOOL_STATS)

    createClientMock.mockResolvedValueOnce(publicClient({ data: { ...validRow, total_members: -1 }, error: null }))
    await expect(fetchHomepageSchoolStats()).resolves.toEqual(FALLBACK_HOMEPAGE_SCHOOL_STATS)
  })
})

describe("getAdminHomepageSchoolStatsState", () => {
  beforeEach(() => { createClientMock.mockReset() })

  it("returns the complete restorable history without a fixed 50-row cutoff", async () => {
    const history = Array.from({ length: 51 }, (_, index) => ({
      ...validRow,
      id: index + 1,
      version: index + 1,
      action: index === 0 ? "seed" : "publish",
      restored_from_version: null,
      published_by_name: "管理员",
    }))
    createClientMock.mockResolvedValue(adminClient(
      { data: validRow, error: null },
      { data: history, error: null },
    ))

    const state = await getAdminHomepageSchoolStatsState()
    expect(state.setupRequired).toBe(false)
    expect(state.history).toHaveLength(51)
    expect(state.history.at(-1)?.version).toBe(51)
  })

  it("uses keyset pages so history can exceed the PostgREST row limit", async () => {
    const history = Array.from({ length: 501 }, (_, index) => {
      const version = 501 - index
      return {
        ...validRow,
        id: version,
        version,
        action: version === 1 ? "seed" : "publish",
        restored_from_version: null,
        published_by_name: "管理员",
      }
    })
    createClientMock.mockResolvedValue(adminClient(
      { data: { ...validRow, version: 501 }, error: null },
      Array.from({ length: 6 }, (_, page) => ({
        data: history.slice(page * 100, (page + 1) * 100),
        error: null,
        count: 501,
      })),
    ))

    const state = await getAdminHomepageSchoolStatsState()
    expect(state.history).toHaveLength(501)
    expect(state.history[0]?.version).toBe(501)
    expect(state.history.at(-1)?.version).toBe(1)
  })

  it("reports setupRequired when either table is missing", async () => {
    createClientMock.mockResolvedValue(adminClient(
      { data: null, error: { code: "PGRST205" } },
      { data: [], error: null },
    ))
    await expect(getAdminHomepageSchoolStatsState()).resolves.toMatchObject({
      setupRequired: true,
      stats: FALLBACK_HOMEPAGE_SCHOOL_STATS,
      history: [],
    })
  })
})
