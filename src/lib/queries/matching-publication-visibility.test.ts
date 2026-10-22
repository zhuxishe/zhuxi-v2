import { createClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ client: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.client }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: vi.fn() }))
import { fetchMatchDetail, fetchPlayerMatches } from "./matching"
import { fetchPlayerMatchHistory } from "./player-history"
import { fetchMyMatchingPublications } from "./matching-publications"

const member = "11111111-1111-4111-8111-111111111111"
const other = "22222222-2222-4222-8222-222222222222"
const match = "33333333-3333-4333-8333-333333333333"
const published = { id: match, member_a_id: member, member_b_id: other, group_members: null as string[] | null,
  status: "confirmed", publication_version: 2, session: { status: "confirmed", publication_version: 2 } }
let rows: typeof published[]
let requests: URL[]
let unavailable: boolean
let publications: unknown

beforeEach(() => {
  vi.resetAllMocks()
  rows = [{ ...published }]; requests = []; unavailable = false; publications = []
  mocks.client.mockReturnValue(createClient("https://match-visibility.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input)); requests.push(url)
      if (unavailable) return new Response(JSON.stringify({ message: "unavailable", code: "42501" }), { status: 403 })
      if (url.pathname.endsWith("/rpc/get_my_matching_publications")) return Response.json(publications)
      const p = url.searchParams
      const data = rows.filter((row) => (!p.get("id") || p.get("id") === `eq.${row.id}`)
        && (!p.get("status") || p.get("status") === `eq.${row.status}` || p.get("status")?.slice(4, -1).split(",").includes(row.status))
        && (!p.get("publication_version") || row.publication_version > Number(p.get("publication_version")!.slice(3)))
        && (!p.get("session.status") || p.get("session.status") === `eq.${row.session.status}`)
        && (!p.get("or") || row.member_a_id === member || row.member_b_id === member || row.group_members?.includes(member)))
      return Response.json(data)
    } },
  }))
})

describe("player match publication visibility", () => {
  it("shows only an owned current published result in both listing and direct detail", async () => {
    expect(await fetchPlayerMatches(member)).toHaveLength(1)
    expect(await fetchMatchDetail(match, member)).toMatchObject({ id: match })
    expect(requests.every((url) => url.searchParams.get("session.status") === "eq.confirmed")).toBe(true)
    expect(requests.every((url) => url.searchParams.get("publication_version") === "gt.0")).toBe(true)
    expect(requests.every((url) => url.searchParams.get("or")?.includes(`group_members.cs.{${member}}`))).toBe(true)
  })

  it.each([
    ["unpublished session", { session: { status: "draft", publication_version: 2 } }],
    ["unpublished result", { status: "draft" }],
    ["never-published split result", { status: "cancelled", publication_version: 0 }],
    ["an obsolete confirmed result", { publication_version: 1 }],
    ["another member's result", { member_a_id: other, member_b_id: other }],
  ])("does not expose %s through a guessed detail URL", async (_name, changes) => {
    rows = [{ ...published, ...changes }]
    expect(await fetchPlayerMatches(member)).toEqual([])
    expect(await fetchMatchDetail(match, member)).toBeNull()
  })

  it("retains a legitimately published cancellation as history while withdrawal hides it", async () => {
    rows = [{ ...published, status: "cancelled", publication_version: 1 }]
    expect(await fetchPlayerMatches(member)).toEqual([])
    expect(await fetchPlayerMatchHistory(member)).toHaveLength(1)
    expect(await fetchMatchDetail(match, member)).toMatchObject({ status: "cancelled" })
    rows[0].session = { status: "draft", publication_version: 2 }
    expect(await fetchPlayerMatchHistory(member)).toEqual([])
    expect(await fetchMatchDetail(match, member)).toBeNull()
  })

  it("accepts an owned published group and rejects malformed URL identifiers before querying", async () => {
    rows = [{ ...published, member_a_id: other, member_b_id: other, group_members: [member, other] }]
    expect(await fetchMatchDetail(match, member)).not.toBeNull()
    requests = []
    expect(await fetchMatchDetail("guessed-draft", member)).toBeNull()
    expect(requests).toEqual([])
  })

  it("fails closed on a query failure instead of treating it as an available or missing result", async () => {
    unavailable = true
    await expect(fetchPlayerMatches(member)).rejects.toMatchObject({ code: "42501" })
    await expect(fetchMatchDetail(match, member)).rejects.toMatchObject({ code: "42501" })
  })
})

describe("member publication status", () => {
  it("uses the authenticated RPC without accepting a member identifier", async () => {
    publications = [{ round_id: "round", status: "waiting", result_id: null }]
    expect(await fetchMyMatchingPublications()).toEqual(publications)
    expect(requests[0].pathname).toBe("/rest/v1/rpc/get_my_matching_publications")
    expect(requests[0].search).toBe("")
  })
  it("does not replace a status failure or invalid response with a misleading empty state", async () => {
    publications = {}
    await expect(fetchMyMatchingPublications()).rejects.toThrow("Invalid matching publication status")
    unavailable = true
    await expect(fetchMyMatchingPublications()).rejects.toThrow("Unable to load")
  })
})
