import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ auth: vi.fn(), round: vi.fn(), open: vi.fn(), readiness: vi.fn() }))
vi.mock("@/lib/auth/player", () => ({ requirePlayer: mocks.auth }))
vi.mock("@/lib/queries/player-rounds", () => ({ fetchPlayerRound: mocks.round }))
vi.mock("@/lib/queries/rounds", () => ({ fetchOpenRound: mocks.open }))
vi.mock("@/lib/matching/readiness-server", () => ({ fetchMyMatchingReadiness: mocks.readiness }))
import { checkMatchingEntry } from "./profile-actions"
const id = "429eea31-9986-42a8-b2b9-67f792e07173"
const round = { id, purpose: "matching", status: "open", survey_start: "2026-10-01", survey_end: "2026-11-01" }
describe("preflight before leaving a matching entry", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime("2026-10-23")
    mocks.round.mockResolvedValue(round); mocks.open.mockResolvedValue(round)
    mocks.readiness.mockResolvedValue({ supplementary: false, personality: true, quiz: false, missing: ["supplementary", "quiz"] })
  })
  afterEach(() => vi.useRealTimers())
  it("returns every missing profile and resolves a legacy entry to the actual round", async () => {
    expect(await checkMatchingEntry()).toEqual({ state: "incomplete", roundId: id, missing: ["supplementary", "quiz"] })
    expect(mocks.auth).toHaveBeenCalledOnce(); expect(mocks.open).toHaveBeenCalledOnce()
  })
  it("allows a completed member to continue", async () => {
    mocks.readiness.mockResolvedValue({ supplementary: true, personality: true, quiz: true, missing: [] })
    expect(await checkMatchingEntry(id)).toEqual({ state: "continue" })
  })
  it.each(["registration", "announcement"])("does not inspect profiles for %s", async (purpose) => {
    mocks.round.mockResolvedValue({ ...round, purpose })
    expect(await checkMatchingEntry(id)).toEqual({ state: "continue" })
    expect(mocks.readiness).not.toHaveBeenCalled()
  })
  it("lets the destination explain closure without asking for unnecessary profile work", async () => {
    mocks.round.mockResolvedValue({ ...round, status: "closed" })
    expect(await checkMatchingEntry(id)).toEqual({ state: "continue" })
    expect(mocks.readiness).not.toHaveBeenCalled()
  })
  it("reports a read failure separately from missing answers", async () => {
    mocks.readiness.mockRejectedValue(new Error("offline"))
    expect(await checkMatchingEntry(id)).toEqual({ state: "failed" })
  })
  it("rejects malformed round references without a query", async () => {
    expect(await checkMatchingEntry("https://other.example")).toEqual({ state: "failed" })
    expect(mocks.round).not.toHaveBeenCalled()
  })
})
