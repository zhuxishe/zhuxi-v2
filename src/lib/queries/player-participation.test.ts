import { createClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PlayerParticipationDetail } from "@/types/player-participation"

const mocks = vi.hoisted(() => ({ client: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }))
import { fetchPlayerParticipationDetail, fetchPlayerParticipationRecords } from "./player-participation"

const roundId = "11111111-1111-4111-8111-111111111111"
const base: PlayerParticipationDetail & { member_id: string; round_id: string } = {
  id: "submission", member_id: "member", round_id: roundId, created_at: "2026-09-28T00:00:00Z", updated_at: null,
  game_type_pref: "都可以", gender_pref: "都可以", availability: {}, interest_tags: [], social_style: null, message: null, custom_answers: {},
  round: { id: roundId, round_name: "Closed registration", purpose: "registration", status: "closed", survey_start: "2026-09-01T00:00:00Z", survey_end: "2026-09-25T00:00:00Z", activity_start: "2026-09-30", activity_end: "2026-09-30" },
}
let records: typeof base[]
let requests: URL[]
let denied: boolean

describe("personal participation queries", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    records = []; requests = []; denied = false
    mocks.client.mockResolvedValue(createClient("https://participation-test.invalid", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input) => {
        const url = new URL(String(input)); requests.push(url)
        if (denied) return new Response(JSON.stringify({ message: "Denied", code: "42501" }), { status: 403 })
        const params = url.searchParams
        const data = records.filter((record) => `eq.${record.member_id}` === params.get("member_id")
          && (params.get("round.deleted_at") !== "is.null" || !record.round.deleted_at)
          && (!params.get("round_id") || `eq.${record.round_id}` === params.get("round_id")))
        const from = Number(params.get("offset") ?? 0), limit = Number(params.get("limit") ?? data.length)
        return new Response(JSON.stringify(data.slice(from, from + limit)), { headers: { "content-type": "application/json" } })
      } },
    }))
  })

  it("keeps closed and matched submissions and never includes another member's record", async () => {
    records = [base, { ...base, id: "matched", round: { ...base.round, status: "matched" } }, { ...base, id: "someone-else", member_id: "other" }]
    expect((await fetchPlayerParticipationRecords("member")).map((record) => record.id)).toEqual(["submission", "matched"])
    expect(requests[0].searchParams.get("member_id")).toBe("eq.member")
    expect(requests[0].searchParams.has("round.status")).toBe(false)
  })

  it("retains cancellation state and saved answers in owned records", async () => {
    records = [{ ...base, cancelled_at: "2026-09-29T01:00:00Z", custom_answers: { food: "veg" } }]
    expect((await fetchPlayerParticipationRecords("member"))[0].cancelled_at).toBe("2026-09-29T01:00:00Z")
    expect((await fetchPlayerParticipationDetail("member", roundId))?.custom_answers).toEqual({ food: "veg" })
    expect(requests.every((request) => request.searchParams.get("select")?.includes("cancelled_at"))).toBe(true)
    expect(requests.every((request) => !request.searchParams.has("cancelled_at"))).toBe(true)
  })

  it("loads records beyond one response page without truncating older history", async () => {
    records = Array.from({ length: 101 }, (_, index) => ({ ...base, id: `record-${index}` }))
    const result = await fetchPlayerParticipationRecords("member")
    expect(result).toHaveLength(101)
    expect(result.at(-1)?.id).toBe("record-100")
    expect(requests).toHaveLength(2)
    expect(requests[1].searchParams.get("offset")).toBe("100")
  })

  it("scopes a permanent detail link to the current member and exact round", async () => {
    records = [base]
    expect((await fetchPlayerParticipationDetail("member", roundId))?.round.status).toBe("closed")
    expect(await fetchPlayerParticipationDetail("other", roundId)).toBeNull()
    expect(requests[0].searchParams.get("round_id")).toBe(`eq.${roundId}`)
    expect(requests[1].searchParams.get("member_id")).toBe("eq.other")
  })

  it("rejects malformed record paths before querying", async () => {
    expect(await fetchPlayerParticipationDetail("member", "round&member=other")).toBeNull()
    expect(mocks.client).not.toHaveBeenCalled()
  })

  it("hides deleted activities while retaining the member's other closed records and blocks their old detail links", async () => {
    records = [
      ...Array.from({ length: 101 }, (_, index) => ({ ...base, id: `deleted-${index}`, round: { ...base.round, deleted_at: "2026-09-29T01:00:00Z" } })),
      { ...base, id: "retained", round_id: "22222222-2222-4222-8222-222222222222", round: { ...base.round, id: "22222222-2222-4222-8222-222222222222" } },
    ]
    expect((await fetchPlayerParticipationRecords("member")).map((record) => record.id)).toEqual(["retained"])
    expect(await fetchPlayerParticipationDetail("member", roundId)).toBeNull()
    expect(requests.every((request) => request.searchParams.get("round.deleted_at") === "is.null")).toBe(true)
    expect(requests.every((request) => request.searchParams.get("select")?.includes("match_rounds!inner"))).toBe(true)
  })

  it("reports read failure rather than showing an empty personal history", async () => {
    denied = true
    await expect(fetchPlayerParticipationRecords("member")).rejects.toThrow("Unable to load")
    await expect(fetchPlayerParticipationDetail("member", roundId)).rejects.toThrow("Unable to load")
  })
})
