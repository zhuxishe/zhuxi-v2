import { createClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ client: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }))
import { fetchMatchHistory } from "./match-history"
import { fetchPairRelations } from "./pair-relations-build"
import { pairKey } from "@/lib/matching/pair-history"

const a = "11111111-1111-4111-8111-111111111111"
const b = "22222222-2222-4222-8222-222222222222"
const formal = { status: "confirmed", round_id: "formal-round", round: { is_test: false } }
const test = { status: "confirmed", round_id: "test-round", round: { is_test: true } }
let requests: URL[]

beforeEach(() => {
  vi.resetAllMocks(); requests = []
  mocks.client.mockResolvedValue(createClient("https://history-scope.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async input => {
      const url = new URL(String(input)); requests.push(url)
      const rows = url.pathname.endsWith("/match_results") ? [
        { id: "test-1", member_a_id: a, member_b_id: b, group_members: null, session: test },
        { id: "test-2", member_a_id: a, member_b_id: b, group_members: null, session: [test] },
        { id: "formal", member_a_id: a, member_b_id: b, group_members: null, session: formal },
      ] : url.pathname.endsWith("/mutual_reviews") ? [
        // Test five-star rows deliberately precede formal one-star rows so
        // filtering must occur before the existing directional deduplication.
        { reviewer_id: a, reviewee_id: b, overall_score: 5, match_result_id: "test-1", match: { session: test } },
        { reviewer_id: b, reviewee_id: a, overall_score: 5, match_result_id: "test-1", match: [{ session: [test] }] },
        { reviewer_id: a, reviewee_id: b, overall_score: 1, match_result_id: "formal", match: { session: formal } },
        { reviewer_id: b, reviewee_id: a, overall_score: 4, match_result_id: "formal", match: { session: formal } },
      ] : []
      return Response.json(rows)
    } },
  }))
})

describe("matching history and feedback scope using the real Supabase query builder", () => {
  it("counts formal and test pairings independently for the same controlled real accounts", async () => {
    expect((await fetchMatchHistory([a, b])).get(a)).toEqual([{ name: b, count: 1 }])
    expect((await fetchMatchHistory([a, b], { isTestRound: true })).get(a)).toEqual([{ name: b, count: 2 }])
    expect(requests.every(url => url.searchParams.get("select")?.includes("round:match_rounds(is_test)"))).toBe(true)
    expect(requests.every(url => url.searchParams.get("session.status") === "eq.confirmed")).toBe(true)
  })

  it("keeps legacy feedback rules while preventing test feedback from replacing formal feedback", async () => {
    const formalRelations = await fetchPairRelations([a, b])
    const testRelations = await fetchPairRelations([a, b], { isTestRound: true })
    expect(formalRelations.get(pairKey(a, b))).toMatchObject({ status: "blacklist", totalPairCount: 1, hasMutualFive: false })
    expect(testRelations.get(pairKey(a, b))).toMatchObject({ totalPairCount: 2, hasMutualFive: true })
    expect(testRelations.get(pairKey(a, b))?.status).not.toBe("blacklist")
  })
})
