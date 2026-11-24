import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import LargeActivityDetailPage from "./page"

const mocks = vi.hoisted(() => ({
  fetchActivity: vi.fn(),
  fetchRound: vi.fn(),
  checkRoundAccess: vi.fn(),
}))

vi.mock("@/lib/auth/player", () => ({ requirePlayer: async () => ({ memberId: "player-id" }) }))
vi.mock("@/lib/player-activity/queries", () => ({ fetchPlayerLargeActivity: mocks.fetchActivity }))
vi.mock("@/lib/queries/player-rounds", () => ({ fetchPlayerRound: mocks.fetchRound }))
vi.mock("@/lib/matching/round-submission-access", () => ({ getRoundSubmissionAccess: mocks.checkRoundAccess }))
vi.mock("next-intl/server", () => ({
  getLocale: async () => "zh",
  getTranslations: async () => (key: string) => key,
}))
vi.mock("@/components/player/activity/ActivityPageIntro", () => ({ ActivityPageIntro: () => null }))
vi.mock("next/image", () => ({ default: () => null }))
vi.mock("@/components/player/MatchingSurveyLink", () => ({
  MatchingSurveyLink: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { "data-existing-survey-link": "true", href }, children),
}))

const activity = {
  id: "activity-id",
  title: "活动",
  status: "published",
  coverAspectRatio: "3:4",
  galleryUrls: [],
  tags: [],
  registrationRoundId: "5484bcdb-b6d3-4bbf-86fb-c7b370d071e5",
  registrationUrl: "https://example.com/manual",
  registrationStatus: "open",
  registrationDeadline: "2026-12-01T10:30:00+09:00",
  registrationLabel: "手动报名",
} as const

const round = {
  id: activity.registrationRoundId,
  purpose: "registration",
  status: "open",
  is_test: false,
  survey_start: "2026-12-01T09:00:00+09:00",
  survey_end: "2026-12-01T19:45:00+09:00",
}

async function renderDetail() {
  return renderToStaticMarkup(await LargeActivityDetailPage({ params: Promise.resolve({ id: activity.id }) }))
}

describe("large activity signup button", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-12-01T12:00:00+09:00"))
    mocks.fetchActivity.mockResolvedValue(activity)
    mocks.fetchRound.mockResolvedValue(round)
    mocks.checkRoundAccess.mockResolvedValue({ allowed: true })
  })

  afterEach(() => vi.useRealTimers())

  it("renders the existing in-app signup component for the linked round", async () => {
    const html = await renderDetail()
    expect(html).toContain('data-existing-survey-link="true"')
    expect(html).toContain(`href="/app/matching/survey?round=${round.id}"`)
    expect(html).toContain("19:45")
    expect(html).not.toContain("10:30")
    expect(html).not.toContain(activity.registrationUrl)
  })

  it("removes the linked signup button at the actual round deadline", async () => {
    vi.setSystemTime(new Date(round.survey_end))
    const html = await renderDetail()
    expect(html).toContain("registrationEnded")
    expect(html).not.toContain("/app/matching/survey")
    expect(html).not.toContain(activity.registrationUrl)
  })

  it("opens the existing manual URL in a new tab for unlinked activities", async () => {
    mocks.fetchActivity.mockResolvedValue({
      ...activity, registrationRoundId: null, registrationDeadline: "2026-12-01T19:45:00+09:00",
    })
    const html = await renderDetail()
    expect(html).toContain(`href="${activity.registrationUrl}" target="_blank"`)
    expect(html).toContain(activity.registrationLabel)
    expect(mocks.fetchRound).not.toHaveBeenCalled()
  })
})
