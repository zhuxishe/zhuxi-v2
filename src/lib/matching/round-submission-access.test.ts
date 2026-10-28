import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ create: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn(), rpc: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.create }))
// No React render dispatcher in these unit tests. The list must still batch reads.
vi.mock("react", () => ({ cache: <T>(callback: T) => callback }))
import { filterSubmittableRounds, getRoundSubmissionAccess } from "./round-submission-access"

const formal = { id: "formal-round", is_test: false }
const testRound = { id: "test-round", is_test: true }
const denied = { allowed: false, error: "roundParticipationNotAllowed" }
const failed = { allowed: false, error: "roundParticipationCheckFailed" }

describe("round submission participation scope", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    const query = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.single }
    mocks.from.mockReturnValue(query)
    mocks.select.mockReturnValue(query)
    mocks.eq.mockReturnValue(query)
    mocks.single.mockResolvedValue({ data: { is_test: false }, error: null })
    mocks.rpc.mockResolvedValue({ data: [testRound.id], error: null })
    mocks.create.mockResolvedValue({ from: mocks.from, rpc: mocks.rpc })
  })

  it("allows a real member in a formal round using only their canonical row", async () => {
    expect(await getRoundSubmissionAccess(formal, "canonical-member")).toEqual({ allowed: true })
    expect(mocks.from).toHaveBeenCalledWith("members")
    expect(mocks.select).toHaveBeenCalledWith("is_test")
    expect(mocks.eq).toHaveBeenCalledWith("id", "canonical-member")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects a TST member from a formal round", async () => {
    mocks.single.mockResolvedValue({ data: { is_test: true }, error: null })
    expect(await getRoundSubmissionAccess(formal, "test-member")).toEqual(denied)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("allows an approved test-round roster member without requiring a TST identity", async () => {
    expect(await getRoundSubmissionAccess(testRound, "allowed-member")).toEqual({ allowed: true })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_my_test_round_ids")
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it("does not treat an administrator's read visibility as permission to join", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null })
    expect(await getRoundSubmissionAccess(testRound, "admin-member")).toEqual(denied)
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_my_test_round_ids")
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it("requires the exact test round in the caller's allowed list", async () => {
    mocks.rpc.mockResolvedValue({ data: ["another-test-round"], error: null })
    expect(await getRoundSubmissionAccess(testRound, "canonical-member")).toEqual(denied)
  })

  it.each([
    { data: null, error: null },
    { data: {}, error: null },
    { data: { is_test: null }, error: null },
    { data: { is_test: "false" }, error: null },
    { data: { is_test: false }, error: { code: "42501" } },
    { data: null, error: { code: "42703" } },
  ])("distinguishes unreadable or malformed member scope from ineligibility", async (response) => {
    mocks.single.mockResolvedValue(response)
    expect(await getRoundSubmissionAccess(formal, "canonical-member")).toEqual(failed)
  })

  it.each([
    { data: null, error: null },
    { data: "test-round", error: null },
    { data: [42], error: null },
    { data: [""], error: null },
    { data: [], error: { code: "42501" } },
    { data: null, error: { code: "PGRST202" } },
  ])("distinguishes unreadable or malformed allowed lists from an empty allowed list", async (response) => {
    mocks.rpc.mockResolvedValue(response)
    expect(await getRoundSubmissionAccess(testRound, "canonical-member")).toEqual(failed)
  })

  it("fails closed when creating the authenticated client throws", async () => {
    mocks.create.mockRejectedValue(new Error("Request context unavailable"))
    expect(await getRoundSubmissionAccess(formal, "canonical-member")).toEqual(failed)
  })

  it.each([{ id: "round" }, { id: "round", is_test: null }])("fails closed on missing round schema metadata", async (round) => {
    expect(await getRoundSubmissionAccess(round, "canonical-member")).toEqual(failed)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("loads each needed source once for a mixed list and preserves round objects", async () => {
    const secondFormal = { id: "formal-2", is_test: false, title: "Second" }
    const secondTest = { id: "test-2", is_test: true }
    const result = await filterSubmittableRounds([formal, testRound, secondFormal, secondTest], "canonical-member")
    expect(result).toEqual({ rounds: [formal, testRound, secondFormal], error: null })
    expect(result.rounds[2]).toBe(secondFormal)
    expect(mocks.single).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_my_test_round_ids")
  })

  it("keeps only allowed test rounds for TST members", async () => {
    mocks.single.mockResolvedValue({ data: { is_test: true }, error: null })
    expect(await filterSubmittableRounds([formal, testRound], "test-member"))
      .toEqual({ rounds: [testRound], error: null })
  })

  it("does not return a misleading partial eligible list when a required source fails", async () => {
    mocks.rpc.mockRejectedValue(new Error("Unavailable"))
    expect(await filterSubmittableRounds([formal, testRound], "canonical-member"))
      .toEqual({ rounds: [], error: "roundParticipationCheckFailed" })
  })

  it("does not read any source for an empty list", async () => {
    expect(await filterSubmittableRounds([], "canonical-member")).toEqual({ rounds: [], error: null })
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
