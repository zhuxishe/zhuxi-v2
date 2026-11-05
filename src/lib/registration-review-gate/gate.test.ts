import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }))
import { fetchRegistrationReviewGate } from "./server"
import { parseRegistrationReviewGate, type RegistrationReviewBlocker } from "./types"
import { parseRegistrationReturnContext, registrationReturnHref, registrationReviewHref } from "./navigation"

const roundId = "429eea31-9986-42a8-b2b9-67f792e07173"
const targetId = "b0b34817-bc52-432a-a314-f77c965149ae"
const matchId = "e535d1ce-e2e2-4237-aa22-850e1ff2804c"
const blocker: RegistrationReviewBlocker = { round_id: roundId, round_name: "竹溪社活动", purpose: "registration",
  ended_at: "2026-11-17T15:00:00Z", review_href: `/app/matches/rounds/${roundId}/reviews` }

describe("registration review RPC and return navigation", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.rpc.mockResolvedValue({ data: { blockers: [blocker] }, error: null }) })
  it("reads only the caller's obligations without caching between attempts", async () => {
    expect(await fetchRegistrationReviewGate(targetId)).toEqual({ blockers: [blocker] })
    mocks.rpc.mockResolvedValueOnce({ data: { blockers: [] }, error: null })
    expect(await fetchRegistrationReviewGate(targetId)).toEqual({ blockers: [] })
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "player_get_registration_review_gate", { p_round_id: targetId })
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })
  it.each([null, {}, { blockers: null }, { blockers: [null] }, { blockers: [{ ...blocker, ended_at: "bad" }] },
    { blockers: [{ ...blocker, review_href: "https://outside.example/" }] },
    { blockers: [{ ...blocker, review_href: `/app/matches/rounds/${targetId}/reviews` }] },
    { blockers: [blocker, blocker] }])("rejects an unknown or malformed response", (value) => {
    expect(() => parseRegistrationReviewGate(value)).toThrow()
  })
  it("propagates a database read error without treating it as permission to register", async () => {
    mocks.rpc.mockResolvedValue({ data: { blockers: [] }, error: { message: "offline" } })
    await expect(fetchRegistrationReviewGate(targetId)).rejects.toThrow("Unable to check registration reviews")
  })
  it("does not query a malformed target", async () => {
    await expect(fetchRegistrationReviewGate("https://outside.example")).rejects.toThrow()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("preserves a validated registration origin through either review system", () => {
    const context = { roundId: targetId, fromParticipation: true }
    expect(registrationReviewHref(blocker, context)).toBe(`${blocker.review_href}?returnRound=${targetId}&from=participation`)
    const matching = { ...blocker, purpose: "matching" as const, review_href: `/app/reviews/new/${matchId}` }
    expect(parseRegistrationReviewGate({ blockers: [matching] })).toEqual({ blockers: [matching] })
    expect(registrationReviewHref(matching, context)).toBe(`/app/reviews/new/${matchId}?returnRound=${targetId}&from=participation`)
    expect(parseRegistrationReturnContext({ returnRound: targetId, from: "participation" })).toEqual(context)
    expect(registrationReturnHref(context)).toBe(`/app/matching/survey?round=${targetId}&from=participation`)
  })
  it.each([{}, { returnRound: [targetId, roundId] }, { returnRound: "https://outside.example" }])("ignores missing, repeated or external return targets", (query) => {
    expect(parseRegistrationReturnContext(query)).toBeNull()
  })
  it("never carries arbitrary URLs or unknown origin values", () => {
    const context = parseRegistrationReturnContext({ returnRound: targetId, from: "https://outside.example", returnTo: "https://outside.example" })!
    expect(registrationReturnHref(context)).toBe(`/app/matching/survey?round=${targetId}`)
    expect(() => registrationReviewHref({ ...blocker, review_href: "//outside.example" }, context)).toThrow()
  })
})
