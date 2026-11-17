import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), legacy: vi.fn(), single: vi.fn(), from: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, from: mocks.from }) }))
import { checkReviewExists, fetchMatchReviewRoute, fetchReviewedMatchIds } from "./reviews"

const legacyId = "10000000-0000-4000-8000-000000000001"
const unifiedId = "10000000-0000-4000-8000-000000000002"
const roundId = "20000000-0000-4000-8000-000000000001"
const missing = (name: string, code = "PGRST202") => ({ data: null, error: { code, message: `Could not find the function public.${name}` } })

beforeEach(() => {
  vi.resetAllMocks()
  const chain = { select: () => chain, eq: () => chain, not: mocks.legacy, maybeSingle: mocks.single }
  mocks.from.mockReturnValue(chain)
  mocks.legacy.mockResolvedValue({ data: [{ match_result_id: legacyId }], error: null })
  mocks.single.mockResolvedValue({ data: { id: "review" }, error: null })
  mocks.rpc.mockImplementation(async (name: string) => name === "player_get_match_review_route"
    ? { data: { review_system: "legacy", round_id: roundId, reviewed: true }, error: null }
    : { data: { match_ids: [unifiedId] }, error: null })
})

describe("matching review source compatibility", () => {
  it("merges legacy and unified completion for existing matching cards", async () => {
    expect(await fetchReviewedMatchIds("self")).toEqual(new Set([legacyId, unifiedId]))
    expect(mocks.from).toHaveBeenCalledWith("mutual_reviews")
    expect(mocks.rpc).toHaveBeenCalledWith("player_list_unified_reviewed_match_ids")
  })

  it.each(["PGRST202", "42883"])("retains the legacy path before the new RPC is installed (%s)", async (code) => {
    mocks.rpc.mockImplementation(async (name: string) => missing(name, code))
    expect(await fetchMatchReviewRoute(legacyId)).toEqual({ reviewSystem: "legacy", roundId: null, reviewed: false })
    expect(await fetchReviewedMatchIds("self")).toEqual(new Set([legacyId]))
    expect(await checkReviewExists(legacyId, "self")).toBe(true)
  })

  it("uses the unified completion result instead of consulting the old table", async () => {
    mocks.rpc.mockResolvedValue({ data: { review_system: "unified", round_id: roundId, reviewed: false }, error: null })
    expect(await checkReviewExists(unifiedId, "self")).toBe(false)
    expect(mocks.from).not.toHaveBeenCalled()
    expect(await fetchMatchReviewRoute(unifiedId)).toEqual({ reviewSystem: "unified", roundId, reviewed: false })
  })

  it.each([
    { code: "42501", message: "permission denied" },
    { code: "XX000", message: "database unavailable" },
    { code: "42883", message: "function private.missing_helper does not exist" },
  ])("does not treat an installed RPC failure as legacy or no completed reviews: $code", async (error) => {
    mocks.rpc.mockResolvedValue({ data: null, error })
    await expect(fetchMatchReviewRoute(unifiedId)).rejects.toThrow("Unable to load")
    await expect(fetchReviewedMatchIds("self")).rejects.toThrow("Unable to load")
  })

  it("does not erase legacy completion when its query fails", async () => {
    mocks.legacy.mockResolvedValue({ data: null, error: { message: "offline" } })
    await expect(fetchReviewedMatchIds("self")).rejects.toThrow("Unable to load legacy")
    mocks.single.mockResolvedValue({ data: null, error: { message: "offline" } })
    await expect(checkReviewExists(legacyId, "self")).rejects.toThrow("Unable to load legacy")
  })

  it.each([null, {}, { review_system: "unified", round_id: null, reviewed: false }, { review_system: "future", round_id: roundId, reviewed: true }])("rejects an invalid route response instead of enabling the legacy writer", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null })
    await expect(fetchMatchReviewRoute(unifiedId)).rejects.toThrow("Invalid matching review route")
  })

  it.each([null, {}, { match_ids: ["not-a-match-id"] }])("rejects malformed completion data instead of returning an empty set", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null })
    await expect(fetchReviewedMatchIds("self")).rejects.toThrow("Invalid unified")
  })
})
