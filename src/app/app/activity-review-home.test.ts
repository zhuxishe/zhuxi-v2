import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ActivityReviewRound } from "@/lib/activity-reviews/types"

const mocks = vi.hoisted(() => ({ rounds: [] as ActivityReviewRound[], locale: "zh" }))
vi.mock("@/lib/auth/player", () => ({ getPlayerInfo: async () => ({ memberId: "self", name: "小竹" }) }))
vi.mock("@/lib/auth/routing", () => ({ resolvePlayerRoute: () => ({ action: "render", view: "approved" }) }))
vi.mock("next-intl/server", () => ({ getLocale: async () => mocks.locale, getTranslations: async () => (key: string) => key }))
vi.mock("@/lib/profile/queries", () => ({ fetchMyProfileSummary: async () => ({ nickname: "小竹", compatibilityStatus: "pending", identityComplete: true, supplementaryComplete: true, personalityComplete: true, quizComplete: true, level: 1, activityCount: 0 }) }))
vi.mock("@/lib/queries/player-rounds", () => ({ fetchPlayerRounds: async () => [], fetchSubmittedRoundIds: async () => [] }))
vi.mock("@/lib/player-activity/queries", () => ({ fetchPlayerActivityHub: async () => ({ largeActivities: [], socialScripts: [] }) }))
vi.mock("@/lib/community/queries/official", () => ({ fetchPublishedAnnouncements: async () => [] }))
vi.mock("@/lib/activity-reviews/queries", () => ({ fetchMyActivityReviewRounds: async () => mocks.rounds }))
import PlayerHomePage from "./page"

type Props = { children?: ReactNode; pendingReviewCount?: number; pendingReviewHref?: string; labels?: { reviews?: string }; action?: { title: string; href: string; description: string } }
function find(node: ReactNode, predicate: (props: Props) => boolean): Props | undefined {
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean)
  if (!isValidElement<Props>(node)) return
  return predicate(node.props) ? node.props : find(node.props.children, predicate)
}
const round: ActivityReviewRound = { roundId: "event", title: "秋季迎新派对", status: "open", opensAt: null, closesAt: null, reviewedCount: 15, participantCount: 20, canReview: true, canReport: true }

describe("home event review entry", () => {
  beforeEach(() => { mocks.rounds = []; mocks.locale = "zh" })

  it("counts open activities instead of unrated people and routes to participation records", async () => {
    mocks.rounds = [round, { ...round, roundId: "second", reviewedCount: 0 }, { ...round, roundId: "closed", status: "closed", canReview: false }, { ...round, roundId: "no-access", canReview: false }]
    const page = await PlayerHomePage()
    const quick = find(page, (props) => props.pendingReviewCount !== undefined)
    expect(quick?.pendingReviewCount).toBe(2)
    expect(quick?.pendingReviewHref).toBe("/app/matches#participation")
    expect(find(page, (props) => Boolean(props.action))?.action?.title).toBe("2 场活动可以互评")
  })

  it("keeps the shortcut usable with no open activity and uses Japanese activity-based copy", async () => {
    mocks.locale = "ja"
    let page = await PlayerHomePage()
    expect(find(page, (props) => props.pendingReviewCount !== undefined)?.pendingReviewCount).toBe(0)
    expect(find(page, (props) => props.pendingReviewCount !== undefined)?.labels?.reviews).toBe("相互評価")
    mocks.rounds = [round]
    page = await PlayerHomePage()
    expect(find(page, (props) => Boolean(props.action))?.action?.title).toBe("1 件のイベントで評価を受付中")
  })
})
