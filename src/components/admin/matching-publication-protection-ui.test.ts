import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }))
vi.mock("@/app/admin/matching/[id]/pool-actions", () => ({ runPoolRematch: vi.fn() }))
vi.mock("@/app/admin/matching/[id]/actions", () => ({ lockPair: vi.fn(), unlockPair: vi.fn(), splitPair: vi.fn(), restorePair: vi.fn(), confirmSession: vi.fn(), deleteSession: vi.fn(), unpublishSession: vi.fn() }))
vi.mock("@/app/admin/matching/[id]/manual-actions", () => ({ manualPair: vi.fn(), checkPairCompatibility: vi.fn(), checkGroupCompatibility: vi.fn() }))
import { RematchPool } from "./RematchPool"
import { MatchSessionView } from "./MatchSessionView"

const poolMembers = ["A", "B"].map((id) => ({ id, name: `成员${id}`, memberData: null }))

describe("published matching controls", () => {
  it("keeps the pool visible but disables both modification paths after publication", () => {
    const props = { sessionId: "session", poolMembers, poolSummary: { submitted_count: 2, eligible_count: 2, excluded_count: 0, exclusion_summary: [], has_existing_multi_pool: false }, auditReason: "核对取消池后执行操作", onRefresh: vi.fn() }
    const draft = renderToStaticMarkup(createElement(RematchPool, props))
    const published = renderToStaticMarkup(createElement(RematchPool, { ...props, readOnly: true, status: "published" }))
    expect(draft).toContain("再匹配池（2 人）")
    expect(published).toContain("再匹配池")
    expect(published).not.toContain("再匹配池（2 人）")
    expect(published).not.toContain("符合资格")
    expect(published).not.toContain("资格待确认")
    expect(published).not.toContain("暂不可读取")
    expect(published).toContain("结果已发布。如需重新配对，请先撤回发布")
    expect(draft).not.toMatch(/<button[^>]*\sdisabled=""/)
    expect(published.match(/<button[^>]*\sdisabled=""/g)).toHaveLength(2)
    expect(published).toContain("运行再匹配")
    expect(published).toContain("手动配对")
  })

  it("preserves the withdrawal entry and explains how to edit an already published result", () => {
    const html = renderToStaticMarkup(createElement(MatchSessionView, {
      session: { id: "session", session_name: "测试匹配", status: "confirmed", publication_version: 2, results_ready: true, total_candidates: 2, total_matched: 2, total_unmatched: 0 },
      results: [], diagnostics: [], candidates: [], allMemberOptions: [{ id: "A", name: "成员A" }],
    }))
    expect(html).toContain("撤回发布")
    expect(html).toContain("如需调整配对，请先撤回发布")
    expect(html).toContain("取消申请仍可在审批页面处理")
    expect(html).not.toContain("确认发布")
    expect(html).not.toContain(">重新匹配</button>")
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>[^<]*<svg[\s\S]*?手动配对/)
    expect(html).toContain("结果已发布。如需重新配对，请先撤回发布")
    expect(html).not.toContain("资格待确认")
    expect(html).not.toContain("暂不可读取")
  })

  it("shows fresh pool counts again when withdrawal returns the session to a ready draft", () => {
    const props = {
      session: { id: "session", session_name: "测试匹配", status: "confirmed", round_id: "round", publication_version: 1, results_ready: true, total_candidates: 2, total_matched: 0, total_unmatched: 2 },
      results: [], diagnostics: [], candidates: [], poolMembers,
      poolSummary: { submitted_count: 2, eligible_count: 2, excluded_count: 0, exclusion_summary: [], has_existing_multi_pool: false },
    }
    const published = renderToStaticMarkup(createElement(MatchSessionView, props))
    const withdrawn = renderToStaticMarkup(createElement(MatchSessionView, { ...props, session: { ...props.session, status: "draft" } }))
    expect(published).not.toContain("符合资格 2 人")
    expect(published).not.toContain("再匹配池（2 人）")
    expect(withdrawn).toContain("符合资格 2 人")
    expect(withdrawn).toContain("再匹配池（2 人）")
    expect(withdrawn).not.toContain("结果已发布。如需重新配对")
  })

  it("tells the administrator to wait while results are still being generated", () => {
    const html = renderToStaticMarkup(createElement(MatchSessionView, {
      session: { id: "session", session_name: "生成中", status: "draft", publication_version: 0, results_ready: false, total_candidates: 2, total_matched: 0, total_unmatched: 2 },
      results: [], diagnostics: [], candidates: [],
    }))
    expect(html).toContain("匹配结果尚未生成完成，完成后才能发布")
    expect(html).toContain("确认发布")
    expect(html).toContain("保留方案，返回运行")
    expect(html).toContain("当前方案仍保留")
    expect(html).not.toContain("删除当前结果")
    expect(html).toContain("匹配结果生成后，可处理待重新匹配的成员")
    expect(html).not.toContain("资格待确认")
    expect(html).not.toContain("暂不可读取")
  })
})
