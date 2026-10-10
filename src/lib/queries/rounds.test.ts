import { createClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ client: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: vi.fn() }))
import { fetchLatestRound, fetchOpenRound, fetchRound, fetchRounds } from "./rounds"

const now = new Date("2026-09-29T01:00:00Z")
const eligible = { id: "eligible", status: "open", survey_start: "2026-09-28T00:00:00Z", survey_end: "2026-09-30T00:00:00Z" }
let rows: (typeof eligible & { deleted_at?: string | null; created_at?: string })[]
let requests: URL[]

describe("open round query against the collection window", () => {
  beforeEach(() => {
    rows = []; requests = []
    // Exercise the real Supabase query builder; emulate only the HTTP data source.
    const client = createClient("https://survey-test.invalid", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input, init) => {
        const url = new URL(String(input)); requests.push(url)
        const params = url.searchParams
        const data = rows.filter((row) => {
          if (params.has("status") && params.get("status") !== `eq.${row.status}`) return false
          if (params.has("id") && params.get("id") !== `eq.${row.id}`) return false
          if (params.get("deleted_at") === "is.null" && row.deleted_at) return false
          const start = params.get("survey_start")
          const end = params.get("survey_end")
          return (!start || Date.parse(row.survey_start) <= Date.parse(start.slice(4)))
            && (!end || Date.parse(row.survey_end) > Date.parse(end.slice(3)))
        }).sort((a, b) => params.get("order") === "created_at.desc"
          ? Date.parse(b.created_at ?? "2026-09-29T00:00:00Z") - Date.parse(a.created_at ?? "2026-09-29T00:00:00Z")
          : Date.parse(a.survey_end) - Date.parse(b.survey_end))
          .slice(0, Number(params.get("limit") ?? rows.length))
        if (new Headers(init?.headers).get("accept")?.includes("application/vnd.pgrst.object")) {
          return data.length === 1
            ? new Response(JSON.stringify(data[0]), { headers: { "content-type": "application/json" } })
            : new Response(JSON.stringify({ message: "Expected one row", code: "PGRST116" }), { status: 406 })
        }
        return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } })
      } },
    })
    mocks.client.mockResolvedValue(client)
  })

  it("skips expired and future rounds before selecting the earliest eligible deadline", async () => {
    rows = [
      { ...eligible, id: "expired", survey_end: now.toISOString() },
      { ...eligible, id: "scheduled", survey_start: "2026-09-29T02:00:00Z", survey_end: "2026-09-29T03:00:00Z" },
      { ...eligible, id: "closed", status: "closed" },
      { ...eligible, id: "later", survey_end: "2026-10-01T00:00:00Z" },
      eligible,
    ]
    expect(await fetchOpenRound(now)).toEqual(eligible)
  })

  it("has no available round at the exact deadline", async () => {
    rows = [{ ...eligible, survey_end: now.toISOString() }]
    expect(await fetchOpenRound(now)).toBeNull()
  })

  it("accepts the exact opening time", async () => {
    rows = [{ ...eligible, survey_start: now.toISOString() }]
    expect((await fetchOpenRound(now))?.id).toBe("eligible")
  })

  it("excludes deleted entries from the admin list, direct detail and latest/open selectors", async () => {
    const deleted = { ...eligible, id: "deleted", deleted_at: now.toISOString(), created_at: "2026-09-29T00:00:00Z" }
    rows = [
      ...Array.from({ length: 101 }, (_, index) => ({ ...deleted, id: `deleted-${index}` })),
      { ...eligible, created_at: "2026-09-28T00:00:00Z" }, deleted,
    ]
    expect((await fetchRounds()).map((round) => round.id)).toEqual(["eligible"])
    expect((await fetchLatestRound())?.id).toBe("eligible")
    expect((await fetchOpenRound(now))?.id).toBe("eligible")
    await expect(fetchRound("deleted")).rejects.toMatchObject({ code: "PGRST116" })
    expect(requests.every((request) => request.searchParams.get("deleted_at") === "is.null")).toBe(true)
  })
})
