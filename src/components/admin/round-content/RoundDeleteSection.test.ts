import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/app/admin/matching/rounds/[id]/delete-actions", () => ({ deleteRound: vi.fn() }))
import { RoundDeleteSection } from "./RoundDeleteSection"

const props = { roundId: "round", roundName: "秋季迎新派对", revision: 1, canDelete: true, hasMatches: false, busy: false }
const render = (overrides: Partial<typeof props> = {}) => renderToStaticMarkup(createElement(RoundDeleteSection, { ...props, ...overrides }))

describe("round deletion entry", () => {
  it("explains data retention and confirmation before allowing the action", () => {
    const html = render()
    expect(html).toContain("已有报名数据会保留")
    expect(html).toContain("已有匹配记录、评分或举报的活动不可删除")
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""/)
  })
  it.each([
    [{ canDelete: false }, "仅超级管理员"],
    [{ hasMatches: true }, "本期已有匹配记录"],
    [{ busy: true }, "请先保存当前修改"],
  ])("disables deletion when the entry is blocked", (overrides, explanation) => {
    const html = render(overrides)
    expect(html).toMatch(/<button[^>]*\sdisabled=""/)
    expect(html).toContain(explanation)
  })
})
