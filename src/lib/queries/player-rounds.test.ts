import { createClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { RoundRecord } from "@/types/matching-round"

const mocks = vi.hoisted(() => ({ client: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }))
import { fetchPlayerRound, fetchPlayerRounds, fetchSubmittedRoundIds } from "./player-rounds"

const now = new Date("2026-09-29T01:00:00Z")
const id = "11111111-1111-4111-8111-111111111111"
const base: RoundRecord = {
  id, round_name: "活动", status: "open", survey_start: "2026-09-29T00:00:00Z", survey_end: "2026-09-30T00:00:00Z",
  activity_start: "2026-10-10", activity_end: "2026-10-11",
}
let rounds: RoundRecord[]
let submissions: { round_id: string; member_id: string; cancelled_at?: string | null }[]
let requests: URL[]
let unavailable: boolean

describe("player round queries with the real Supabase request builder", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    rounds = []; submissions = []; requests = []; unavailable = false
    mocks.client.mockResolvedValue(createClient("https://rounds-test.invalid", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input) => {
        const url = new URL(String(input)); requests.push(url)
        if (unavailable) return new Response(JSON.stringify({ message: "Denied", code: "42501" }), { status: 403 })
        const params = url.searchParams
        const data = url.pathname.endsWith("/match_rounds") ? rounds.filter((round) => {
          const status = params.get("status"), start = params.get("survey_start"), end = params.get("survey_end"), selected = params.get("id")
          return (!status || status === `eq.${round.status}`) && (!selected || selected === `eq.${round.id}`)
            && (!start || Date.parse(round.survey_start) <= Date.parse(start.slice(4)))
            && (!end || Date.parse(round.survey_end) > Date.parse(end.slice(3)))
        }).sort((a, b) => Date.parse(a.survey_end) - Date.parse(b.survey_end)).slice(0, Number(params.get("limit") ?? rounds.length))
          : submissions.filter((submission) => `eq.${submission.member_id}` === params.get("member_id")
            && (params.get("cancelled_at") !== "is.null" || !submission.cancelled_at)
            && (params.get("round_id") ?? "").slice(4, -1).split(",").includes(submission.round_id)).map(({ round_id }) => ({ round_id }))
        return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } })
      } },
    }))
  })

  it("includes all three open purposes while excluding future, expired and closed entries before limiting", async () => {
    rounds = [
      ...Array.from({ length: 101 }, (_, index) => ({ ...base, id: `expired-${index}`, survey_end: now.toISOString() })),
      { ...base, id: "future", survey_start: "2026-09-29T02:00:00Z" }, { ...base, id: "closed", status: "closed" },
      { ...base, id: "registration", purpose: "registration", survey_end: "2026-10-01T00:00:00Z" },
      { ...base, id: "announcement", purpose: "announcement", survey_end: "2026-10-02T00:00:00Z" }, base,
    ]
    expect((await fetchPlayerRounds(now)).map((round) => round.id)).toEqual([id, "registration", "announcement"])
    expect(requests[0].searchParams.get("survey_start")).toBe(`lte.${now.toISOString()}`)
    expect(requests[0].searchParams.get("survey_end")).toBe(`gt.${now.toISOString()}`)
    expect(requests[0].searchParams.get("limit")).toBe("100")
  })

  it("accepts the exact opening instant and rejects the exact deadline", async () => {
    rounds = [{ ...base, survey_start: now.toISOString() }, { ...base, id: "expired", survey_end: now.toISOString() }]
    expect((await fetchPlayerRounds(now)).map((round) => round.id)).toEqual([id])
  })

  it("fetches only the explicitly selected round and does not fall back to a different round", async () => {
    rounds = [base, { ...base, id: "22222222-2222-4222-8222-222222222222", status: "closed" }]
    expect((await fetchPlayerRound(id))?.id).toBe(id)
    expect(await fetchPlayerRound("33333333-3333-4333-8333-333333333333")).toBeNull()
    expect(requests[0].searchParams.get("id")).toBe(`eq.${id}`)
  })

  it("rejects malformed round identities without making a request", async () => {
    expect(await fetchPlayerRound("id&round=other")).toBeNull()
    expect(mocks.client).not.toHaveBeenCalled()
  })

  it("scopes submission lookup to the canonical member and the displayed round IDs", async () => {
    submissions = [{ member_id: "member", round_id: id }, { member_id: "other", round_id: "round2" }, { member_id: "member", round_id: "hidden" }]
    expect(await fetchSubmittedRoundIds("member", [id, "round2"])).toEqual([id])
    expect(requests[0].searchParams.get("member_id")).toBe("eq.member")
  })

  it("treats cancelled registration as available again across home and recruiting entries", async () => {
    submissions = [
      { member_id: "member", round_id: id, cancelled_at: "2026-09-29T01:00:00Z" },
      { member_id: "member", round_id: "active", cancelled_at: null },
    ]
    expect(await fetchSubmittedRoundIds("member", [id, "active"])).toEqual(["active"])
    expect(requests[0].searchParams.get("cancelled_at")).toBe("is.null")
  })

  it("does not query submissions for an empty entry list", async () => {
    expect(await fetchSubmittedRoundIds("member", [])).toEqual([])
    expect(mocks.client).not.toHaveBeenCalled()
  })

  it("surfaces read errors rather than presenting missing data as an empty list", async () => {
    unavailable = true
    await expect(fetchPlayerRounds(now)).rejects.toThrow("Unable to load")
    await expect(fetchPlayerRound(id)).rejects.toThrow("Unable to load")
    await expect(fetchSubmittedRoundIds("member", [id])).rejects.toThrow("Unable to load")
  })
})
