import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ auth: vi.fn(), round: vi.fn(), open: vi.fn(), readiness: vi.fn(), access: vi.fn(), reviews: vi.fn(), submission: vi.fn() }))
vi.mock("@/lib/auth/player", () => ({ requirePlayer: mocks.auth }))
vi.mock("@/lib/queries/player-rounds", () => ({ fetchPlayerRound: mocks.round }))
vi.mock("@/lib/queries/rounds", () => ({ fetchOpenRound: mocks.open, fetchMySubmission: mocks.submission }))
vi.mock("@/lib/matching/readiness-server", () => ({ fetchMyMatchingReadiness: mocks.readiness }))
vi.mock("@/lib/matching/round-submission-access", () => ({ getRoundSubmissionAccess: mocks.access }))
vi.mock("@/lib/registration-review-gate/server", () => ({ fetchRegistrationReviewGate: mocks.reviews }))
import { checkMatchingEntry } from "./profile-actions"
const id = "429eea31-9986-42a8-b2b9-67f792e07173"
const round = { id, purpose: "matching", status: "open", survey_start: "2026-10-01", survey_end: "2026-11-01" }
describe("preflight before leaving a matching entry", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime("2026-10-23")
    mocks.auth.mockResolvedValue({ memberId: "own-member" }); mocks.access.mockResolvedValue({ allowed: true })
    mocks.round.mockResolvedValue(round); mocks.open.mockResolvedValue(round)
    mocks.readiness.mockResolvedValue({ supplementary: false, personality: true, quiz: false, missing: ["supplementary", "quiz"] })
    mocks.reviews.mockResolvedValue({ blockers: [] })
    mocks.submission.mockResolvedValue(null)
  })
  afterEach(() => vi.useRealTimers())
  it.each(["roundParticipationNotAllowed", "roundParticipationCheckFailed"])("leaves %s to the destination instead of asking for unrelated profile work", async (error) => {
    mocks.access.mockResolvedValue({ allowed: false, error })
    expect(await checkMatchingEntry(id)).toEqual({ state: "continue" })
    expect(mocks.access).toHaveBeenCalledWith(round, "own-member")
    expect(mocks.readiness).not.toHaveBeenCalled()
  })
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
  it.each(["matching", "registration"])("checks outstanding reviews for %s without navigating first", async (purpose) => {
    const blockers = [{ round_id: "previous-round", round_name: "较早结束的活动" }]
    mocks.round.mockResolvedValue({ ...round, purpose })
    mocks.readiness.mockResolvedValue({ missing: [] })
    mocks.reviews.mockResolvedValue({ blockers })
    expect(await checkMatchingEntry(id)).toEqual({ state: "reviews_required", roundId: id, blockers })
    expect(mocks.reviews).toHaveBeenCalledExactlyOnceWith(id)
  })
  it("reports review lookup failure separately and never treats it as completed", async () => {
    mocks.round.mockResolvedValue({ ...round, purpose: "registration" })
    mocks.reviews.mockRejectedValue(new Error("offline"))
    expect(await checkMatchingEntry(id)).toEqual({ state: "review_failed", roundId: id })
    expect(mocks.readiness).not.toHaveBeenCalled()
  })
  it.each(["matching", "registration"])("keeps an existing %s edit accessible even when the review RPC is unavailable", async (purpose) => {
    mocks.round.mockResolvedValue({ ...round, purpose })
    mocks.readiness.mockResolvedValue({ missing: [] })
    mocks.submission.mockResolvedValue({ id: "saved", cancelled_at: null })
    mocks.reviews.mockRejectedValue(new Error("offline"))
    expect(await checkMatchingEntry(id)).toEqual({ state: "continue" })
    expect(mocks.submission).toHaveBeenCalledExactlyOnceWith(id, "own-member")
    expect(mocks.reviews).not.toHaveBeenCalled()
  })
  it("does not treat a cancelled existing registration as an exempt edit", async () => {
    mocks.round.mockResolvedValue({ ...round, purpose: "registration" })
    mocks.submission.mockResolvedValue({ id: "saved", cancelled_at: "2026-10-22T09:00:00Z" })
    mocks.reviews.mockRejectedValue(new Error("offline"))
    expect(await checkMatchingEntry(id)).toEqual({ state: "review_failed", roundId: id })
    expect(mocks.reviews).toHaveBeenCalledExactlyOnceWith(id)
  })
})
