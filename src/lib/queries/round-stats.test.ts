import { createClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.client }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("./player-rounds", () => ({ fetchPlayerRounds: vi.fn() }))
import { fetchRoundStats } from "./rounds"

interface Submission {
  round_id: string
  cancelled_at: string | null
  game_type_pref: string
  gender_pref: string | null
  availability: unknown
  member: unknown
}
let rows: Submission[]
let requests: Array<{ url: URL; method: string }>
let sourceError: boolean
beforeEach(() => {
  vi.resetAllMocks()
  requests = []; rows = []; sourceError = false
  mocks.admin.mockResolvedValue({ id: "admin", role: "super_admin" })
  // Real PostgREST query building, with only the HTTP data source replaced.
  mocks.client.mockReturnValue(createClient("https://round-statistics-test.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)), params = url.searchParams
      requests.push({ url, method: init?.method ?? "GET" })
      if (sourceError) return new Response(JSON.stringify({ code: "42501", message: "statistics query denied" }), { status: 403 })
      const selected = rows.filter((row) => params.get("round_id") === `eq.${row.round_id}`
        && (params.get("cancelled_at") !== "is.null" || row.cancelled_at === null))
        .slice(0, Number(params.get("limit") ?? rows.length))
        .map(({ game_type_pref, gender_pref, availability, member }) => ({ game_type_pref, gender_pref, availability, member }))
      return new Response(JSON.stringify(selected), { headers: { "content-type": "application/json" } })
    } },
  }))
})

function submission(round_id: string, gender: string, preference: string, cancelled_at: string | null = null): Submission {
  return { round_id, cancelled_at, game_type_pref: "都可以", gender_pref: preference, availability: { "2026-11-04": ["下午"] },
    member: { member_identity: { gender } } }
}

describe("administrator round demographic read boundary", () => {
  it("counts only the selected round's active registrations and returns aggregates, not personal rows", async () => {
    rows = [submission("round-a", "male", "女"), submission("round-a", "female", "都可以"),
      submission("round-a", "female", "男", "2026-11-01T00:00:00Z"), submission("round-b", "male", "男")]
    const stats = await fetchRoundStats("round-a")
    expect(stats.total).toBe(2)
    expect(stats.genderDist).toEqual({ male: 1, female: 1, unspecified: 0 })
    expect(stats.genderPreferenceDist).toEqual({ male: 0, female: 1, either: 1, unspecified: 0 })
    expect(stats.slotCounts).toEqual({ "2026-11-04_下午": 2 })
    expect(stats).not.toHaveProperty("member")
    expect(stats).not.toHaveProperty("submissions")
    expect(requests).toHaveLength(1)
    expect(requests[0].url.pathname).toBe("/rest/v1/match_round_submissions")
    expect(requests[0].url.searchParams.get("select")).toBe("game_type_pref,gender_pref,availability,member:members(member_identity(gender))")
    expect(requests[0].url.searchParams.get("cancelled_at")).toBe("is.null")
    expect(requests[0].url.searchParams.get("limit")).toBe("500")
    expect(requests[0].method).toBe("GET")
  })

  it("rejects unauthorized calls before obtaining the service client", async () => {
    mocks.admin.mockRejectedValue(new Error("not an administrator"))
    await expect(fetchRoundStats("round-a")).rejects.toThrow("not an administrator")
    expect(mocks.client).not.toHaveBeenCalled()
    expect(requests).toEqual([])
  })

  it("allows ordinary administrators to receive the same aggregate-only statistics", async () => {
    mocks.admin.mockResolvedValue({ id: "admin", role: "admin" })
    rows = [submission("round-a", "male", "女")]
    expect(await fetchRoundStats("round-a")).toMatchObject({ total: 1, genderDist: { male: 1 }, genderPreferenceDist: { female: 1 } })
    expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(mocks.client.mock.invocationCallOrder[0])
  })

  it("propagates a failed read instead of presenting zero signups", async () => {
    sourceError = true
    await expect(fetchRoundStats("round-a")).rejects.toMatchObject({ code: "42501" })
  })

  it("returns zero demographics for a successfully read empty round", async () => {
    expect(await fetchRoundStats("round-a")).toMatchObject({ total: 0,
      genderDist: { male: 0, female: 0, unspecified: 0 },
      genderPreferenceDist: { male: 0, female: 0, either: 0, unspecified: 0 } })
  })
})
