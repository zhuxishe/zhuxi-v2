import { renderToReadableStream } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PlayerParticipationRecord } from "@/types/player-participation"
import type { ActivityReviewRound } from "@/lib/activity-reviews/types"

const mocks = vi.hoisted(() => ({
  matches: [] as Record<string, unknown>[],
  history: [] as Record<string, unknown>[],
  participation: [] as PlayerParticipationRecord[],
  reviewedIds: new Set<string>(),
  participationQuery: vi.fn(),
  groupQuery: vi.fn(),
  reviewRounds: [] as ActivityReviewRound[],
}))
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key, getLocale: async () => "zh" }))
vi.mock("next-intl", () => ({ useLocale: () => "zh", useTranslations: () => (key: string) => key }))
vi.mock("@/lib/auth/player", () => ({ requirePlayer: async () => ({ memberId: "self" }) }))
vi.mock("@/lib/queries/matching", () => ({ fetchPlayerMatches: async () => mocks.matches }))
vi.mock("@/lib/queries/player-history", () => ({ fetchPlayerMatchHistory: async () => mocks.history }))
vi.mock("@/lib/queries/reviews", () => ({ fetchReviewedMatchIds: async () => mocks.reviewedIds }))
vi.mock("@/lib/queries/group-members", () => ({ fetchGroupMemberNames: (...args: unknown[]) => mocks.groupQuery(...args) }))
vi.mock("@/lib/queries/player-participation", () => ({ fetchPlayerParticipationRecords: (...args: unknown[]) => mocks.participationQuery(...args) }))
vi.mock("@/lib/activity-reviews/queries", () => ({ fetchMyActivityReviewRounds: async () => mocks.reviewRounds }))
vi.mock("@/lib/matching/use-survey-window", () => ({ useSurveyWindow: () => "open" }))
import PlayerMatchesPage from "./page"

const registration: PlayerParticipationRecord = {
  id: "submission", created_at: "2026-09-29T00:00:00Z", updated_at: null,
  round: { id: "autumn", round_name: "秋季迎新派对", purpose: "registration", status: "open", survey_start: "2020-01-01T00:00:00Z", survey_end: "2050-09-30T00:00:00Z", activity_start: "2050-10-01", activity_end: "2050-10-02" },
}
const pair = {
  id: "pair-result", session: { session_name: "双人本安排" },
  member_a: { id: "self" }, member_b: { id: "partner", member_identity: { nickname: "小竹" } },
  cancellation_status: "pending",
}

async function renderPage() {
  const stream = await renderToReadableStream(await PlayerMatchesPage())
  return new Response(stream).text()
}

describe("participation page composition", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.matches = []
    mocks.history = []
    mocks.participation = [registration]
    mocks.reviewedIds = new Set()
    mocks.reviewRounds = []
    mocks.participationQuery.mockImplementation(async () => mocks.participation)
    mocks.groupQuery.mockResolvedValue([])
  })

  it("shows a member's registration even when there have never been any match results", async () => {
    const html = await renderPage()
    expect(html).toContain("matchingEmpty")
    expect(html).toContain('id="participation"')
    expect(html).toContain("秋季迎新派对")
    expect(html).toContain('href="/app/matches/rounds/autumn"')
    expect(html).not.toContain('href="/app/matching/survey?round=autumn&amp;from=participation"')
    expect(mocks.participationQuery).toHaveBeenCalledWith("self")
    expect(html.indexOf('id="matching"')).toBeLessThan(html.indexOf('id="participation"'))
  })

  it("preserves existing pair and group detail links, review and cancellation state above registrations", async () => {
    mocks.matches = [pair, { id: "group-result", group_members: ["self", "friend"], session: { session_name: "多人本安排" } }]
    mocks.reviewedIds.add("pair-result")
    mocks.groupQuery.mockResolvedValue([{ id: "friend", name: "小叶" }])
    const html = await renderPage()
    expect(html).toContain('href="/app/matches/pair-result"')
    expect(html).toContain('href="/app/matches/group-result"')
    expect(html).toContain("小竹")
    expect(html).toContain("小叶")
    expect(html).toContain("cancelBadgePending")
    expect(html).toContain("reviewed")
    expect(html).toContain("秋季迎新派对")
    expect(html).not.toContain("matchingEmpty")
    expect(mocks.groupQuery).toHaveBeenCalledWith(["friend"])
  })

  it("keeps cancelled history in an expandable section and renders the registration empty state independently", async () => {
    mocks.history = [{ ...pair, id: "cancelled-result", session: { session_name: "上次匹配" }, cancellation_status: "approved" }]
    mocks.participation = []
    const html = await renderPage()
    expect(html).toContain("<details")
    expect(html).toContain("historyTitle")
    expect(html).toContain("上次匹配")
    expect(html).toContain("cancelBadgeApproved")
    expect(html).toContain("matchEnded")
    expect(html).toContain('id="participation"')
    expect(html).toContain('href="/app/matching"')
    expect(html).not.toContain("/app/matches/cancelled-result")
  })

  it("adds an event-review entry for an eligible registration without needing a match result", async () => {
    mocks.reviewRounds = [{ roundId: "autumn", title: "秋季迎新派对", status: "open", opensAt: null, closesAt: null, reviewedCount: 2, participantCount: 12, canReview: true, canReport: true }]
    const html = await renderPage()
    expect(html).toContain('href="/app/matches/rounds/autumn/reviews"')
    expect(html).toContain("评价本场玩家")
    expect(html).toContain("matchingEmpty")
  })

  it("keeps an entry for an administrator-confirmed attendee who has no signup record", async () => {
    mocks.participation = []
    mocks.reviewRounds = [{ roundId: "autumn", title: "秋季迎新派对", status: "open", opensAt: null, closesAt: null, reviewedCount: 0, participantCount: 12, canReview: true, canReport: true }]
    const html = await renderPage()
    expect(html).toContain("秋季迎新派对")
    expect(html).toContain('href="/app/matches/rounds/autumn/reviews"')
    expect(html).not.toContain('href="/app/matches/rounds/autumn"')
  })
})
