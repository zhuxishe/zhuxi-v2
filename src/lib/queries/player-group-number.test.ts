import { createClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ client: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.client }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: vi.fn() }))
import { fetchMatchDetail, fetchPlayerMatches } from "./matching"
import { fetchPlayerMatchHistory } from "./player-history"

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const member = id(1), friend = id(2), sid = id(90), testSid = id(91)
const session = { id: sid, status: "confirmed", publication_version: 4, round: { id: id(92), round_name: "活动", is_test: false } }
const group = (n: number, rank: number, status = "confirmed") => ({ id: id(n), session_id: sid, member_a_id: member, member_b_id: null, group_members: [member, friend], rank, status, publication_version: 4, best_slot: "2026-11-14_下午", session })
let rows: ReturnType<typeof group>[]
let requests: URL[]
const isMetadata = (url: URL) => url.searchParams.get("select")?.startsWith("id,session_id,rank,status")
beforeEach(() => {
  requests = []
  rows = [group(101, 8), group(102, 50), group(103, 90, "cancelled")]
  mocks.client.mockReturnValue(createClient("https://own-group-number.invalid", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input)); requests.push(url)
      if (url.pathname.endsWith("/rpc/get_my_test_round_ids")) return Response.json([])
      const p = url.searchParams
      if (isMetadata(url)) {
        const data = rows.filter((row) => !!row.group_members?.length && ["confirmed", "cancelled"].includes(row.status) && p.get("session_id")?.includes(row.session_id) && p.get("or")?.includes(`publication_version.eq.${row.publication_version}`))
          .map(({ id: resultId, session_id, rank, status, publication_version, session: publication }) => ({ id: resultId, session_id, rank, status, publication_version, session: publication }))
        return Response.json(data, { headers: { "content-range": `0-${Math.max(data.length - 1, 0)}/${data.length}` } })
      }
      const data = rows.filter((row) => (!p.get("id") || p.get("id") === `eq.${row.id}`)
        && (!p.get("status") || p.get("status") === `eq.${row.status}` || p.get("status")?.includes(row.status))
        && row.publication_version > 0 && row.session.status === "confirmed"
        && row.group_members.includes(member))
      // Initial player query simulates owning only group 102, plus specifically
      // requested history/details and any denied test-domain row.
      return Response.json(p.get("id") || p.get("status") === "eq.cancelled" ? data : data.filter((row) => row.id === id(102) || row.session.round.is_test))
    } },
  }))
})

describe("owned player group-number query composition", () => {
  it("enriches the one visible owned M02 result using minimal batch metadata for listing and detail", async () => {
    const listing = await fetchPlayerMatches(member)
    expect(listing).toHaveLength(1); expect(listing[0]).toMatchObject({ id: id(102), group_number: 2 })
    expect(await fetchMatchDetail(id(102), member)).toMatchObject({ id: id(102), group_number: 2 })
    const reads = requests.filter((url) => isMetadata(url))
    expect(reads).toHaveLength(2)
    expect(reads.every((url) => !/member_identity|member_a_id|member_b_id|group_members/.test(url.searchParams.get("select") ?? ""))).toBe(true)
    expect(JSON.stringify(listing)).not.toContain(id(101))
  })
  it("retains current and older cancelled history while enriching only the reliably current publication", async () => {
    rows.push({ ...group(104, 2, "cancelled"), publication_version: 3 })
    const history = await fetchPlayerMatchHistory(member)
    expect(history).toHaveLength(2)
    expect(history.find((row) => row.id === id(103))?.group_number).toBe(3)
    expect(history.find((row) => row.id === id(104))?.group_number).toBeUndefined()
    expect(await fetchMatchDetail(id(104), member)).toMatchObject({ id: id(104), status: "cancelled" })
  })
  it("applies test-round and ownership boundaries before discovering batches for group numbering", async () => {
    rows.push({ ...group(105, 1), session_id: testSid, session: { ...session, id: testSid, round: { ...session.round, id: id(93), is_test: true } } })
    expect((await fetchPlayerMatches(member)).map((row) => row.id)).toEqual([id(102)])
    const reads = requests.filter((url) => isMetadata(url))
    expect(reads).toHaveLength(1)
    expect(reads[0].searchParams.get("session_id")).not.toContain(testSid)
    requests = []
    rows.push({ ...group(106, 1), member_a_id: friend, group_members: [friend] })
    expect(await fetchMatchDetail(id(106), member)).toBeNull()
    expect(requests.some((url) => isMetadata(url))).toBe(false)
  })
})
