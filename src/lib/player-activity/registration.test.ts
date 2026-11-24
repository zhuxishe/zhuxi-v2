import { beforeEach, describe, expect, it, vi } from "vitest"
import { resolveLargeActivityRegistration } from "./registration"

const mocks = vi.hoisted(() => ({
  fetchPlayerRound: vi.fn(),
  getRoundSubmissionAccess: vi.fn(),
}))
vi.mock("@/lib/queries/player-rounds", () => ({ fetchPlayerRound: mocks.fetchPlayerRound }))
vi.mock("@/lib/matching/round-submission-access", () => ({
  getRoundSubmissionAccess: mocks.getRoundSubmissionAccess,
}))

const round = {
  id: "86279b51-f0c8-497e-a13e-f15f5ccb76df",
  purpose: "registration",
  status: "open",
  survey_start: "2026-11-25T09:00:00+09:00",
  survey_end: "2026-11-25T18:00:00+09:00",
  deleted_at: null,
  is_test: false,
}
const activity = {
  status: "published",
  registrationStatus: "open",
  registrationUrl: "https://example.com/previous-form",
  registrationDeadline: "2026-11-23T18:00:00+09:00",
  registrationRoundId: round.id,
} as const
const now = new Date("2026-11-25T12:00:00+09:00")

describe("large activity signup", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.fetchPlayerRound.mockResolvedValue(round)
    mocks.getRoundSubmissionAccess.mockResolvedValue({ allowed: true })
  })

  it("uses the authenticated player's linked round instead of the older manual URL and deadline", async () => {
    expect(await resolveLargeActivityRegistration(activity, "current-player", now)).toEqual({
      source: "round",
      status: "open",
      href: `/app/matching/survey?round=${round.id}`,
      deadline: round.survey_end,
    })
    expect(mocks.fetchPlayerRound).toHaveBeenCalledWith(round.id)
    expect(mocks.getRoundSubmissionAccess).toHaveBeenCalledWith(round, "current-player")
  })

  it.each([
    ["2026-11-25T08:59:59+09:00", "coming_soon"],
    ["2026-11-25T18:00:00+09:00", "ended"],
  ])("reads the actual signup window at %s", async (clock, status) => {
    expect(await resolveLargeActivityRegistration(activity, "current-player", new Date(clock))).toEqual({
      source: "round", status, href: null, deadline: round.survey_end,
    })
  })

  it("closes the entry immediately when an administrator closes the round", async () => {
    mocks.fetchPlayerRound.mockResolvedValue({ ...round, status: "closed" })
    expect(await resolveLargeActivityRegistration(activity, "current-player", now)).toEqual({
      source: "round", status: "closed", href: null, deadline: round.survey_end,
    })
  })

  it.each([
    null,
    { ...round, is_test: true },
    { ...round, purpose: "announcement" },
    { ...round, status: "draft" },
    { ...round, deleted_at: "2026-11-24T15:00:00Z" },
  ])("hides the linked date and signup for unavailable rounds", async (unavailable) => {
    mocks.fetchPlayerRound.mockResolvedValue(unavailable)
    expect(await resolveLargeActivityRegistration(activity, "current-player", now)).toEqual({
      source: "round", status: "closed", href: null, deadline: null,
    })
    expect(mocks.getRoundSubmissionAccess).not.toHaveBeenCalled()
  })

  it("hides the round when the player fails its participation check", async () => {
    mocks.getRoundSubmissionAccess.mockResolvedValue({ allowed: false, error: "roundParticipationNotAllowed" })
    expect(await resolveLargeActivityRegistration(activity, "current-player", now)).toEqual({
      source: "round", status: "closed", href: null, deadline: null,
    })
  })

  it("keeps manual signup behavior for an unlinked activity", async () => {
    const manual = { ...activity, registrationRoundId: null }
    const dates = { opens: new Date("2026-11-23T12:00:00+09:00"), expired: now }
    expect(await resolveLargeActivityRegistration(manual, "current-player", dates.opens)).toEqual({
      source: "manual", status: "open", href: activity.registrationUrl, deadline: activity.registrationDeadline,
    })
    expect(await resolveLargeActivityRegistration(manual, "current-player", dates.expired)).toMatchObject({
      source: "manual", status: "closed",
    })
    expect(mocks.fetchPlayerRound).not.toHaveBeenCalled()
  })
})
