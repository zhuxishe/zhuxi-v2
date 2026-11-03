import { createElement } from "react"
import { renderToReadableStream } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import zh from "@/messages/zh.json"

const mocks = vi.hoisted(() => ({ match: null as Record<string, unknown> | null, groups: vi.fn() }))
vi.mock("next-intl", () => ({ useLocale: () => "zh", useTranslations: () => (key: string) => key }))
vi.mock("next-intl/server", () => ({ getLocale: async () => "zh", getTranslations: async () => (key: string) => (zh.playerMatches as Record<string, string>)[key] ?? key }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), notFound: () => { throw new Error("not found") } }))
vi.mock("@/lib/auth/player", () => ({ requirePlayer: async () => ({ memberId: "self" }) }))
vi.mock("@/lib/queries/matching", () => ({ fetchMatchDetail: async () => mocks.match }))
vi.mock("@/lib/queries/reviews", () => ({ fetchReviewedMatchIds: async () => new Set<string>() }))
vi.mock("@/lib/queries/group-members", () => ({ fetchGroupMemberNames: mocks.groups }))
vi.mock("@/app/app/matches/[id]/actions", () => ({ requestCancellation: vi.fn() }))
import { PlayerMatchResultCard } from "./PlayerMatchResultCard"
import MatchDetailPage from "@/app/app/matches/[id]/page"

const labels = { partner: "匹配对象", interests: "兴趣爱好", socialStyle: "社交风格", gameType: "游戏偏好", review: "活动后互评", reviewed: "已评价", cancelBadgePending: "待审核", cancelBadgeApproved: "已取消", cancelBadgeRejected: "已驳回", recommendedTime: "推荐共同时间", timePending: "待工作人员确认" }
const html = async (element: Parameters<typeof renderToReadableStream>[0]) => new Response(await renderToReadableStream(element)).text()
function result(size: number, groupNumber?: number) {
  return { id: "own-result", status: "confirmed", group_number: groupNumber, group_members: ["self", ...Array.from({ length: size - 1 }, (_, i) => `other-${i + 1}`)], best_slot: "2026-11-14_下午", session: { publication_version: 1, round: { round_name: "发布活动" } } }
}
beforeEach(() => { mocks.match = null; mocks.groups.mockResolvedValue([{ id: "other-1", name: "组员甲" }, { id: "other-2", name: "组员乙" }]) })

describe("numbered player group titles", () => {
  it.each([3, 6, 13])("shows M02 as 多人组02 for a %i-member result without using the player's list position or dice", async (size) => {
    const card = createElement(PlayerMatchResultCard, { match: result(size, 2), memberId: "self", nameMap: new Map([["other-1", "组员甲"]]), reviewedIds: new Set<string>(), dateFmt: "zh-CN", labels })
    const value = await html(card)
    expect(value).toContain("多人组02")
    expect(value).toContain("组员甲")
    expect(value).not.toContain(`${size}人组`)
    expect(value).not.toContain("🎲")
    expect(value).not.toContain("多人组01")
  })
  it("uses the same published title in the clickthrough detail page", async () => {
    mocks.match = result(3, 2)
    const value = await html(await MatchDetailPage({ params: Promise.resolve({ id: "own-result" }) }))
    expect(value).toContain("多人组02")
    expect(value).toContain("组员甲、组员乙")
    expect(value).not.toContain("3人组"); expect(value).not.toContain("🎲")
  })
  it("shows a generic group title when an authoritative ordinal is unavailable", async () => {
    const value = await html(createElement(PlayerMatchResultCard, { match: result(6), memberId: "self", nameMap: new Map(), reviewedIds: new Set<string>(), dateFmt: "zh-CN", labels }))
    expect(value).toContain("多人组")
    expect(value).not.toContain("多人组01"); expect(value).not.toContain("6人组")
  })
})
