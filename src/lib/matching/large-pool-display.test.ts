import { createElement } from "react"
import { renderToReadableStream } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({ useLocale: () => "zh", useTranslations: () => (key: string) => key }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { MatchDetailCard } from "@/components/player/MatchDetailCard"
import { GroupReviewSelector } from "@/components/player/GroupReviewSelector"
import { resolveMatchingPublicationNotification } from "@/lib/community/queries/notifications"

const members = Array.from({ length: 13 }, (_, index) => ({ id: `member-${index + 1}`, name: `组员姓名${index + 1}` }))

describe("existing player surfaces with a thirteen-member pool", () => {
  it("renders all twelve other members in the existing match detail and review selector", async () => {
    const others = members.slice(1)
    const detail = createElement(MatchDetailCard, {
      partner: { name: "13人组", hobbyTags: [], gameTypePref: null, scenarioThemeTags: [], expressionStyleTags: [], groupRoleTags: [] },
      sessionName: "匹配批次", reviewed: false, matchId: "pool-result", isGroup: true,
      groupMemberNames: others.map((member) => member.name), recommendedTime: "2030/11/3 晚上",
      labels: { partner: "搭档", unknown: "未知", interests: "兴趣", socialStyle: "社交", gameType: "类型",
        review: "评价", reviewed: "已评价", groupMembers: "组员", recommendedTime: "共同时间" },
    })
    const detailHtml = await new Response(await renderToReadableStream(detail)).text()
    for (const member of others) expect(detailHtml).toContain(member.name)
    expect(detailHtml).toContain("13人组")
    expect(detailHtml).toContain("组员姓名13")
    expect(detailHtml).toContain('<button type="button"')
    expect(detailHtml).not.toContain('href="/app/reviews/new/pool-result"')

    const reviews = createElement(GroupReviewSelector, { matchResultId: "pool-result", members: others, reviewedIds: [] })
    const reviewHtml = await new Response(await renderToReadableStream(reviews)).text()
    for (const member of others) {
      expect(reviewHtml).toContain(member.name)
      expect(reviewHtml).toContain(`/app/reviews/new/pool-result?reviewee=${member.id}`)
    }
  })

  it("resolves the last member's published notification without granting access to an outsider", () => {
    const session = { id: "session", status: "confirmed", publication_version: 1 }
    const result = { id: "pool-result", session_id: "session", status: "confirmed", publication_version: 1,
      member_a_id: members[0].id, member_b_id: null, group_members: members.map((member) => member.id) }
    const notice = { notification_type: "matching_published", round_id: "round", match_session_id: "session",
      match_result_id: "pool-result", publication_version: 1 }
    const sessions = new Map([[session.id, session]])
    const results = new Map([[result.id, result]])
    expect(resolveMatchingPublicationNotification(notice, members[12].id, sessions, results))
      .toEqual({ href: "/app/matches/pool-result", unavailable: false })
    expect(resolveMatchingPublicationNotification(notice, "outsider", sessions, results))
      .toMatchObject({ href: "/app/matches#matching", unavailable: true })
  })
})
