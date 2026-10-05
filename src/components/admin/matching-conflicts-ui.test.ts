import { describe, expect, it, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { EnrichedMatchResult, EnrichedMember } from "./match-detail-types"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/app/admin/matching/[id]/actions", () => ({
  lockPair: vi.fn(), unlockPair: vi.fn(), splitPair: vi.fn(), restorePair: vi.fn(),
  confirmSession: vi.fn(), deleteSession: vi.fn(), unpublishSession: vi.fn(),
}))
vi.mock("@/app/admin/matching/[id]/manual-actions", () => ({
  manualPair: vi.fn(), checkPairCompatibility: vi.fn(), checkGroupCompatibility: vi.fn(),
}))

import { MatchSessionView } from "./MatchSessionView"

function member(id: string, name = id): EnrichedMember {
  return {
    id, record_source: null, member_interests: null, member_personality: null, member_boundaries: null,
    member_identity: { full_name: name, nickname: null, school_name: null, gender: "male", hobby_tags: [], nationality: "", degree_level: null, department: null },
  }
}
function pair(id: string, a: EnrichedMember, b: EnrichedMember, status = "draft"): EnrichedMatchResult {
  return { id, status, rank: 999, member_a: a, member_b: b, group_members: null, group_member_details: null, total_score: 60, best_slot: null, score_breakdown: [] }
}
function render(results: EnrichedMatchResult[], sessionStatus = "draft") {
  return renderToStaticMarkup(createElement(MatchSessionView, {
    session: { id: "session", session_name: "测试轮次", status: sessionStatus, round_id: "round", total_candidates: 4, total_matched: 4, total_unmatched: 0 },
    results, diagnostics: [], candidates: [],
  }))
}

describe("matching conflict notices", () => {
  it("marks both affected groups with distinct references even when stored ranks are equal", () => {
    const html = render([pair("first", member("A"), member("B")), pair("second", member("A"), member("C"))])
    expect(html).toContain("发现 1 位成员被重复分配")
    expect(html.match(/重复成员/g)).toHaveLength(2)
    expect(html).toContain("A 同时出现在第 2 组")
    expect(html).toContain("A 同时出现在第 1 组")
    expect(html).toContain("处理完成后才能发布")
  })

  it("does not mistake identical names or cancelled results for active conflicts", () => {
    const html = render([
      pair("first", member("A", "同名玩家"), member("B")),
      pair("second", member("C", "同名玩家"), member("D")),
      pair("cancelled", member("A"), member("C"), "cancelled"),
    ])
    expect(html).not.toContain("重复成员")
    expect(html).not.toContain("被重复分配")
  })

  it("includes multi-person groups and gives existing published sessions the appropriate next step", () => {
    const group = { ...pair("group", member("B"), member("C")), member_b: null, group_members: ["B", "C", "A"], group_member_details: [member("B"), member("C"), member("A")] }
    const html = render([pair("first", member("A"), member("D")), group], "confirmed")
    expect(html.match(/重复成员/g)).toHaveLength(2)
    expect(html).toContain("请撤回发布后处理冲突配对")
  })
})
