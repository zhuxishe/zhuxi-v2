import { createClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getPlayerSharedAvailability } from "@/lib/matching/player-shared-availability"

const mocks = vi.hoisted(() => ({ client: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.client }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: vi.fn() }))
import { fetchMatchDetail } from "./matching"

const a = "11111111-1111-4111-8111-111111111111"
const b = "22222222-2222-4222-8222-222222222222"
const outsider = "99999999-9999-4999-8999-999999999999"
const matchId = "33333333-3333-4333-8333-333333333333"
const roundId = "44444444-4444-4444-8444-444444444444"
const sessionId = "55555555-5555-4555-8555-555555555555"
const answers: { member_id: string; availability: Record<string, string[]>; cancelled_at: string | null }[] = [
  { member_id: a, availability: { "2026-11-02": ["晚上", "上午", "下午", "上午"], "2026-11-01": ["晚上"], "2026-11-03": ["上午"] }, cancelled_at: null as string | null },
  { member_id: b, availability: { "2026-11-02": ["下午", "上午", "晚上"], "2026-11-01": ["晚上"], "2026-11-04": ["下午"] }, cancelled_at: null as string | null },
]
function fixture() {
  return {
    id: matchId, member_a_id: a, member_b_id: b, group_members: null as string[] | null,
    best_slot: "2026-11-02_下午", status: "confirmed", publication_version: 2,
    session: { id: sessionId, status: "confirmed", publication_version: 2, round: { id: roundId, is_test: false, submissions: structuredClone(answers) } },
  }
}
let primary: ReturnType<typeof fixture> | null
let source: ReturnType<typeof fixture> | null
let requests: URL[]
let sourceFailure: "response" | "throw" | null
let allowedTestRounds: string[]
let enforceFilters: boolean
let accessChecks: number
let failSecondAccessCheck: boolean
let relationsAsArrays: boolean
const scheduleRequests = () => requests.filter((url) => url.searchParams.get("select")?.includes("submissions:match_round_submissions"))
function matches(row: ReturnType<typeof fixture>, params: URLSearchParams) {
  const equal = (key: string, value: unknown) => !params.has(key) || params.get(key) === `eq.${value}`
  const status = params.get("status"), version = params.get("publication_version")
  return equal("id", row.id) && equal("member_a_id", row.member_a_id) && equal("member_b_id", row.member_b_id)
    && (!status || status === `eq.${row.status}` || status.slice(4, -1).split(",").includes(row.status))
    && (!version || version === `eq.${row.publication_version}` || (version.startsWith("gt.") && row.publication_version > Number(version.slice(3))))
    && equal("session.id", row.session.id) && equal("session.status", row.session.status) && equal("session.publication_version", row.session.publication_version)
    && equal("session.round.id", row.session.round?.id)
    && (!params.has("or") || row.member_a_id === a || row.member_b_id === a || row.group_members?.includes(a))
}

beforeEach(() => {
  vi.resetAllMocks()
  primary = fixture(); source = fixture(); requests = []; sourceFailure = null; allowedTestRounds = []; enforceFilters = true; accessChecks = 0; failSecondAccessCheck = false; relationsAsArrays = false
  mocks.client.mockReturnValue(createClient("https://shared-availability.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input)); requests.push(url)
      if (url.pathname.endsWith("/rpc/get_my_test_round_ids")) {
        accessChecks++
        if (failSecondAccessCheck && accessChecks === 2) return new Response(JSON.stringify({ code: "42501", message: "access verification unavailable" }), { status: 403 })
        return Response.json(allowedTestRounds)
      }
      const shared = url.searchParams.get("select")?.includes("submissions:match_round_submissions")
      if (shared && sourceFailure === "throw") throw new Error("network unavailable")
      if (shared && sourceFailure === "response") return new Response(JSON.stringify({ code: "503", message: "unavailable" }), { status: 503 })
      const selected = shared ? source : primary
      if (!selected || (enforceFilters && !matches(selected, url.searchParams))) return Response.json([])
      const row = structuredClone(selected)
      if (!shared) delete (row.session.round as Record<string, unknown>)?.submissions
      else if (url.searchParams.get("session.round.submissions.cancelled_at") === "is.null") row.session.round.submissions = row.session.round.submissions.filter((answer) => answer.cancelled_at === null)
      return Response.json([relationsAsArrays ? { ...row, session: [{ ...row.session, round: [row.session.round] }] } : row])
    } },
  }))
})

describe("owned player duo shared availability query", () => {
  it("returns the chronological intersection, preserving the saved recommendation and hiding raw answers", async () => {
    const result = await fetchMatchDetail(matchId, a)
    expect(result).toMatchObject({ best_slot: "2026-11-02_下午", sharedAvailability: { status: "ready", slots: ["2026-11-01_晚上", "2026-11-02_上午", "2026-11-02_下午", "2026-11-02_晚上"] } })
    expect(JSON.stringify(result)).not.toMatch(/availability|submissions|2026-11-03|2026-11-04/)
    expect(scheduleRequests()).toHaveLength(1)
    const query = scheduleRequests()[0].searchParams
    expect(query.get("select")).toContain("submissions:match_round_submissions(member_id,availability)")
    expect(query.get("session.round.submissions.member_id")).toBe(`in.(${a},${b})`)
    expect(query.get("session.round.submissions.cancelled_at")).toBe("is.null")
    expect(query.get("session.round.id")).toBe(`eq.${roundId}`)
    expect(query.get("session.id")).toBe(`eq.${sessionId}`)
    expect(query.get("session.status")).toBe("eq.confirmed")
    expect(query.get("session.publication_version")).toBe("eq.2")
    expect(query.get("publication_version")).toBe("eq.2")
    expect(query.get("status")).toBe("eq.confirmed")
    expect(query.get("member_a_id")).toBe(`eq.${a}`)
    expect(query.get("member_b_id")).toBe(`eq.${b}`)
    expect(query.get("or")).toContain(`member_a_id.eq.${a}`)
    expect(query.get("select")).not.toMatch(/gender_pref|custom_answers|message|interest_tags|social_style/)
  })

  it.each(["withdrawn", "obsolete", "unowned", "unpublished", "test-restricted"])("does not query schedules for an initially %s result", async (state) => {
    if (state === "withdrawn") primary!.session.status = "draft"
    if (state === "obsolete") primary!.publication_version = 1
    if (state === "unowned") primary!.member_a_id = outsider
    if (state === "unpublished") primary!.publication_version = 0
    if (state === "test-restricted") primary!.session.round.is_test = true
    expect(await fetchMatchDetail(matchId, a)).toBeNull()
    expect(scheduleRequests()).toEqual([])
  })

  it.each(["cancelled", "group"])("does not fetch current schedules for %s details", async (state) => {
    if (state === "cancelled") { primary!.status = "cancelled"; primary!.publication_version = 1 }
    else primary!.group_members = [a, b, outsider]
    expect(await fetchMatchDetail(matchId, a)).toMatchObject({ sharedAvailability: null })
    expect(scheduleRequests()).toEqual([])
  })

  it("represents a legacy pair without a round as unavailable without another query", async () => {
    delete (primary!.session as Record<string, unknown>).round
    expect(await fetchMatchDetail(matchId, a)).toMatchObject({ sharedAvailability: { status: "unavailable", slots: [] } })
    expect(scheduleRequests()).toEqual([])
  })

  it.each(["withdrawn", "cancelled", "replaced-version", "new-partner", "other-round", "group", "new-test-restriction", "deleted"])("does not disclose schedules if the result becomes %s between reads", async (state) => {
    if (state === "withdrawn") source!.session.status = "draft"
    if (state === "cancelled") source!.status = "cancelled"
    if (state === "replaced-version") source!.session.publication_version = 3
    if (state === "new-partner") source!.member_b_id = outsider
    if (state === "other-round") source!.session.round.id = outsider
    if (state === "group") source!.group_members = [a, b, outsider]
    if (state === "new-test-restriction") source!.session.round.is_test = true
    if (state === "deleted") source = null
    expect(await fetchMatchDetail(matchId, a)).toBeNull()
    expect(scheduleRequests()).toHaveLength(1)
  })

  it("checks the returned publication and participant fields even if a malformed response ignored filters", async () => {
    enforceFilters = false
    source!.member_b_id = outsider
    expect(await fetchMatchDetail(matchId, a)).toBeNull()
  })

  it.each(["response", "throw"] as const)("preserves the result with an explicit unavailable state after a schedule %s failure", async (failure) => {
    sourceFailure = failure
    expect(await fetchMatchDetail(matchId, a)).toMatchObject({ id: matchId, best_slot: "2026-11-02_下午", sharedAvailability: { status: "unavailable", slots: [] } })
    expect(scheduleRequests()).toHaveLength(1)
  })

  it("does not use a cancelled participant submission", async () => {
    source!.session.round.submissions[1].cancelled_at = "2026-10-28T02:00:00Z"
    expect(await fetchMatchDetail(matchId, a)).toMatchObject({ sharedAvailability: { status: "unavailable", slots: [] } })
  })

  it("distinguishes a complete empty intersection from unavailable source data", async () => {
    source!.session.round.submissions[1].availability = { "2026-12-01": ["上午"] }
    expect(await fetchMatchDetail(matchId, a)).toMatchObject({ sharedAvailability: { status: "ready", slots: [] } })
  })

  it("normalizes object and single-element array relations without exposing the nested answer source", async () => {
    relationsAsArrays = true
    const result = await fetchMatchDetail(matchId, a)
    expect(result).toMatchObject({ sharedAvailability: { status: "ready" } })
    expect(JSON.stringify(result)).not.toMatch(/availability|submissions/)
  })

  it("fails closed if fresh test-round authorization cannot be verified", async () => {
    primary!.session.round.is_test = source!.session.round.is_test = true
    allowedTestRounds = [roundId]
    failSecondAccessCheck = true
    await expect(fetchMatchDetail(matchId, a)).rejects.toThrow("Unable to verify your matching activity access")
    expect(scheduleRequests()).toHaveLength(1)
  })

  it("retains current test-round permissions on both reads", async () => {
    primary!.session.round.is_test = source!.session.round.is_test = true
    allowedTestRounds = [roundId]
    expect(await fetchMatchDetail(matchId, a)).toMatchObject({ sharedAvailability: { status: "ready" } })
    expect(requests.filter((url) => url.pathname.endsWith("/get_my_test_round_ids"))).toHaveLength(2)
  })
})

describe("player shared availability projection", () => {
  it.each([
    null,
    [],
    [answers[0]],
    [answers[0], answers[0]],
    [answers[0], { member_id: outsider, availability: {} }],
    [answers[0], { member_id: b }],
    [answers[0], { member_id: b, availability: [] }],
    [answers[0], { member_id: b, availability: { "2026-02-30": ["上午"] } }],
    [answers[0], { member_id: b, availability: { "2026-11-02": ["全天"] } }],
  ])("rejects missing, duplicated or malformed input without presenting partial availability", (rows) => {
    expect(getPlayerSharedAvailability([a, b], rows)).toEqual({ status: "unavailable", slots: [] })
  })
  it("accepts explicit empty availability as complete, and rejects a self-pair", () => {
    expect(getPlayerSharedAvailability([a, b], [{ member_id: a, availability: {} }, { member_id: b, availability: {} }])).toEqual({ status: "ready", slots: [] })
    expect(getPlayerSharedAvailability([a, a], answers)).toEqual({ status: "unavailable", slots: [] })
  })
})
