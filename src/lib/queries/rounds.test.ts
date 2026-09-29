import { createClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ client: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: vi.fn() }))
import { fetchOpenRound } from "./rounds"

const now = new Date("2026-09-29T01:00:00Z")
const eligible = { id: "eligible", status: "open", survey_start: "2026-09-28T00:00:00Z", survey_end: "2026-09-30T00:00:00Z" }
let rows: typeof eligible[]

describe("open round query against the collection window", () => {
  beforeEach(() => {
    rows = []
    // Exercise the real Supabase query builder; emulate only the HTTP data source.
    const client = createClient("https://survey-test.invalid", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input) => {
        const params = new URL(String(input)).searchParams
        const data = rows.filter((row) => {
          if (params.get("status") !== `eq.${row.status}`) return false
          const start = params.get("survey_start")
          const end = params.get("survey_end")
          return (!start || Date.parse(row.survey_start) <= Date.parse(start.slice(4)))
            && (!end || Date.parse(row.survey_end) > Date.parse(end.slice(3)))
        }).sort((a, b) => Date.parse(a.survey_end) - Date.parse(b.survey_end))
          .slice(0, Number(params.get("limit") ?? rows.length))
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
})
