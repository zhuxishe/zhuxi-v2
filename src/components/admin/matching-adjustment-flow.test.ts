// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MatchingAdjustmentRecord } from "@/lib/matching/adjustment-types"
import { clearCompletedMatchingAdjustmentRequests, matchingAdjustmentRequestId } from "./matching-adjustment-request"

const mocks = vi.hoisted(() => ({ pair: vi.fn(), group: vi.fn(), manual: vi.fn(), pool: vi.fn(), recover: vi.fn(), split: vi.fn(), restore: vi.fn(), refresh: vi.fn(), paired: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock("@/app/admin/matching/[id]/manual-actions", () => ({ checkPairCompatibility: mocks.pair, checkGroupCompatibility: mocks.group, manualPair: mocks.manual, recoverMatchingAdjustment: mocks.recover }))
vi.mock("@/app/admin/matching/[id]/pool-actions", () => ({ runPoolRematch: mocks.pool }))
vi.mock("@/app/admin/matching/[id]/actions", () => ({ lockPair: vi.fn(), unlockPair: vi.fn(), splitPair: mocks.split, restorePair: mocks.restore, confirmSession: vi.fn(), unpublishSession: vi.fn() }))
import { ManualPairDialog } from "./ManualPairDialog"
import { RematchPool } from "./RematchPool"
import { MatchSessionView } from "./MatchSessionView"

const members = Array.from({ length: 7 }, (_, index) => ({ id: `M${index + 1}`, name: `成员${index + 1}` }))
const compat = { compatible: true, score: 65, breakdown: [], bestSlot: "2026-10-25_晚", constraints: [], warnings: [], revisionToken: "revision-a" }
const reason = "核对资格和整池约束后操作"
let root: Root
function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label)!
}
async function add(id: string) {
  const select = document.querySelector<HTMLSelectElement>('select[aria-label="添加成员"]')!
  await act(async () => { select.value = id; select.dispatchEvent(new Event("change", { bubbles: true })) })
}
async function renderManual(extra = {}) {
  await act(async () => root.render(createElement(ManualPairDialog, { open: true, onOpenChange: vi.fn(), sessionId: "ui-session", poolMembers: members, auditReason: reason, onPaired: mocks.paired, ...extra })))
}
async function setReason() {
  const input = document.getElementById("match-audit-reason") as HTMLInputElement
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, reason); input.dispatchEvent(new Event("input", { bubbles: true })) })
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  sessionStorage.clear()
  document.body.innerHTML = '<div id="root"></div>'
  root = createRoot(document.getElementById("root")!)
  mocks.pair.mockResolvedValue(compat)
  mocks.group.mockResolvedValue(compat)
  mocks.manual.mockResolvedValue({ success: true })
  mocks.pool.mockResolvedValue({ success: true, matchCount: 1 })
  mocks.recover.mockResolvedValue({ success: true })
  mocks.split.mockResolvedValue({ success: true })
  mocks.restore.mockResolvedValue({ success: true })
})
afterEach(async () => {
  await act(async () => root.unmount())
  const ids = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.getItem(sessionStorage.key(index)!)!).filter(Boolean)
  clearCompletedMatchingAdjustmentRequests("ui-session", ids, sessionStorage)
  sessionStorage.clear()
})

describe("manual matching checks and operation retry", () => {
  it("ignores an old asynchronous preview when the selected people change", async () => {
    let resolve!: (result: typeof compat) => void
    mocks.pair.mockReturnValue(new Promise((done) => { resolve = done }))
    await renderManual()
    await add("M1"); await add("M2")
    await act(async () => button("检查兼容性").click())
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="移除成员2"]')!.click())
    await add("M3")
    await act(async () => resolve(compat))
    expect(button("确认配对").disabled).toBe(true)
    expect(document.body.textContent).not.toContain("65.0 分")
    mocks.pair.mockResolvedValue(compat)
    await act(async () => button("检查兼容性").click())
    expect(mocks.pair).toHaveBeenLastCalledWith("ui-session", "M1", "M3")
    expect(button("确认配对").disabled).toBe(false)
  })

  it("cannot force a failed hard constraint even when a shared time exists", async () => {
    mocks.pair.mockResolvedValue({ ...compat, compatible: false, warnings: ["只选多人者不能进入双人结果"] })
    await renderManual(); await add("M1"); await add("M2")
    await act(async () => button("检查兼容性").click())
    expect(button("确认配对").disabled).toBe(true)
    expect([...document.querySelectorAll("button")].some((item) => item.textContent?.includes("强制"))).toBe(false)
    expect(document.body.textContent).toContain("资格或硬约束未通过")
    expect(document.body.textContent).toContain("未通过约束，不能保存评分")
    expect(mocks.manual).not.toHaveBeenCalled()
  })

  it("keeps the same operation ID after an unknown response and clears only success", async () => {
    mocks.manual.mockRejectedValueOnce(new Error("network response lost")).mockResolvedValueOnce({ success: true })
    await renderManual(); await add("M1"); await add("M2")
    await act(async () => button("检查兼容性").click())
    await act(async () => button("确认配对").click())
    expect(document.body.textContent).toContain("配对结果待确认")
    expect(sessionStorage.length).toBe(1)
    const firstId = mocks.manual.mock.calls[0][3]
    await act(async () => button("确认配对").click())
    expect(mocks.manual).toHaveBeenLastCalledWith("ui-session", ["M1", "M2"], reason, firstId, "revision-a")
    expect(mocks.paired).toHaveBeenCalledOnce()
    expect(sessionStorage.length).toBe(0)
    await add("M1"); await add("M2")
    await act(async () => button("检查兼容性").click())
    await act(async () => button("确认配对").click())
    expect(mocks.manual.mock.calls[2][3]).not.toBe(firstId)
  })

  it("accepts more than six selected members and checks the final entire pool", async () => {
    await renderManual()
    for (const member of members) await add(member.id)
    await act(async () => button("检查兼容性").click())
    expect(mocks.group).toHaveBeenCalledWith("ui-session", members.map((member) => member.id))
    expect(button("确认组建 (7人池)").disabled).toBe(false)
    expect(document.body.textContent).toContain("整池平均分：65.0 分")
    await act(async () => button("确认组建 (7人池)").click())
    expect(mocks.manual).toHaveBeenCalledWith("ui-session", members.map((member) => member.id), reason, expect.any(String), "revision-a")
  })

  it("cannot append a second multiplayer pool or alter the existing one automatically", async () => {
    await renderManual({ hasActiveMultiPool: true })
    await add("M1"); await add("M2"); await add("M3")
    await act(async () => button("检查兼容性").click())
    expect(button("确认组建 (3人池)").disabled).toBe(true)
    expect(document.body.textContent).toContain("不会自动修改原池或新增第二池")
    expect(mocks.manual).not.toHaveBeenCalled()
  })
})

describe("cancellation pool and adjustment recovery controls", () => {
  const poolMembers = members.slice(0, 3).map((member, index) => ({ ...member, memberData: null, eligible: index < 2, exclusionReasons: index === 2 ? ["cancelled"] : [] }))
  const poolSummary = { submitted_count: 3, eligible_count: 2, excluded_count: 1, exclusion_summary: [{ reason: "cancelled", count: 1 }], has_existing_multi_pool: true }
  it("shows excluded records, uses qualified counts, and keeps a failed run ID for retry", async () => {
    mocks.pool.mockResolvedValueOnce({ error: "本次保存未完成" }).mockResolvedValueOnce({ success: true, matchCount: 1 })
    await act(async () => root.render(createElement(RematchPool, { sessionId: "ui-session", poolMembers, poolSummary, auditReason: reason, onRefresh: mocks.refresh })))
    expect(document.body.textContent).toContain("符合资格 2 人")
    expect(document.body.textContent).toContain("成员3（本次不参与：已取消报名）")
    expect(document.body.textContent).toContain("不会修改原池或新增第二池")
    await act(async () => button("运行再匹配").click())
    const id = mocks.pool.mock.calls[0][2]
    expect(sessionStorage.length).toBe(1)
    await act(async () => button("运行再匹配").click())
    expect(mocks.pool).toHaveBeenLastCalledWith("ui-session", reason, id)
    expect(sessionStorage.length).toBe(0)
    expect(mocks.refresh).toHaveBeenCalledOnce()
    await act(async () => button("手动配对").click())
    expect([...document.querySelectorAll("select option")].map((item) => item.textContent)).not.toContain("成员3")
  })
  it("fails closed when the current pool eligibility cannot be read", async () => {
    await act(async () => root.render(createElement(RematchPool, { sessionId: "ui-session", poolMembers, auditReason: reason, onRefresh: mocks.refresh })))
    expect(button("运行再匹配").disabled).toBe(true)
    expect(button("手动配对").disabled).toBe(true)
    expect(document.body.textContent).toContain("资格人数暂不可读取")
    expect(document.body.textContent).not.toContain("符合资格 0 人")
  })
  it("restores a failed operation using its original ID and keeps published sessions read-only", async () => {
    const record: MatchingAdjustmentRecord = { id: "00000000-0000-4000-8000-000000000091", session_id: "ui-session", round_id: "round", kind: "manual", status: "failed", attempt: 1, created_at: "2026-10-24T01:00:00Z", updated_at: "2026-10-24T01:00:00Z", captured_at: "2026-10-24T01:00:00Z", submitted_count: 2, eligible_count: 2, excluded_count: 0, exclusion_summary: [], has_existing_multi_pool: false, error_code: "SAVE_FAILED", can_recover: true, base_revision: "fingerprint", actor_admin_id: "admin", result_id: null, member_ids: ["M1", "M2"] }
    const props = { session: { id: "ui-session", status: "draft", round_id: "round", session_name: "测试", total_candidates: 2, total_matched: 0, total_unmatched: 2, results_ready: true }, results: [], diagnostics: [], candidates: [], initialAdjustments: [record] }
    await act(async () => root.render(createElement(MatchSessionView, props)))
    expect(document.body.textContent).toContain("方案调整记录（1）")
    expect(document.body.textContent).toContain("冻结范围 2 人")
    expect(button("沿原输入恢复").disabled).toBe(true)
    await setReason()
    await act(async () => button("沿原输入恢复").click())
    expect(mocks.recover).toHaveBeenCalledWith("ui-session", record.id, reason)
    await act(async () => root.render(createElement(MatchSessionView, { ...props, session: { ...props.session, status: "confirmed" } })))
    expect(button("沿原输入恢复")).toBeUndefined()
    expect(document.body.textContent).toContain("先撤回发布")
  })
  it("retries split and restore using stable IDs, including response loss", async () => {
    const result = (id: string, status: string) => ({ id, status, rank: 1, member_a: null, member_b: null, group_members: null, group_member_details: null, total_score: 61, best_slot: null, score_breakdown: null })
    await act(async () => root.render(createElement(MatchSessionView, { session: { id: "ui-session", status: "draft", round_id: "round", session_name: "测试", total_candidates: 4, total_matched: 2, total_unmatched: 2, results_ready: true }, results: [result("active", "draft"), result("cancelled", "cancelled")], diagnostics: [], candidates: [] })))
    await setReason()
    mocks.split.mockRejectedValueOnce(new Error("lost")).mockResolvedValueOnce({ success: true })
    await act(async () => button("拆散").click())
    expect(document.body.textContent).toContain("调整结果待确认")
    const splitId = mocks.split.mock.calls[0][2]
    await act(async () => button("拆散").click())
    expect(mocks.split).toHaveBeenLastCalledWith("active", reason, splitId)
    const cancelledButton = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.includes("已取消配对 (1组)"))!
    await act(async () => cancelledButton.click())
    mocks.restore.mockResolvedValueOnce({ error: "保存未完成" }).mockResolvedValueOnce({ success: true })
    await act(async () => button("恢复").click())
    const restoreId = mocks.restore.mock.calls[0][2]
    await act(async () => button("恢复").click())
    expect(mocks.restore).toHaveBeenLastCalledWith("cancelled", reason, restoreId)
    expect(restoreId).not.toBe(splitId)
    expect(sessionStorage.length).toBe(0)
  })

  it("requires an explicit choice before releasing a terminal failed ID", async () => {
    const id = "00000000-0000-4000-8000-000000000092"
    matchingAdjustmentRequestId("ui-session", "pool", [], sessionStorage, () => id)
    const record: MatchingAdjustmentRecord = { id, session_id: "ui-session", round_id: "round", kind: "pool", status: "failed", attempt: 1, created_at: "2026-10-24T01:00:00Z", updated_at: "2026-10-24T01:00:00Z", captured_at: "2026-10-24T01:00:00Z", submitted_count: 2, eligible_count: 2, excluded_count: 0, exclusion_summary: [], has_existing_multi_pool: false, error_code: "ADJUSTMENT_CHANGED", can_recover: false, base_revision: "old", actor_admin_id: "admin", result_id: null, member_ids: [] }
    await act(async () => root.render(createElement(MatchSessionView, { session: { id: "ui-session", status: "draft", round_id: "round", session_name: "测试", total_candidates: 2, total_matched: 0, total_unmatched: 2, results_ready: true }, results: [], diagnostics: [], candidates: [], initialAdjustments: [record] })))
    expect(sessionStorage.length).toBe(1)
    expect(button("沿原输入恢复")).toBeUndefined()
    await act(async () => button("重新检查并开始新操作").click())
    expect(sessionStorage.length).toBe(0)
    expect(mocks.pool).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain(id)
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })

  it("keeps aggregate counts when protected adjustment reasons are unavailable", async () => {
    const record: MatchingAdjustmentRecord = { id: "00000000-0000-4000-8000-000000000093", session_id: "ui-session", round_id: "round", kind: "pool", status: "failed", attempt: 1, created_at: "2026-10-24T01:00:00Z", updated_at: "2026-10-24T01:00:00Z", captured_at: "2026-10-24T01:00:00Z", submitted_count: 5, eligible_count: 3, excluded_count: 2, exclusion_summary: null, has_existing_multi_pool: false, error_code: "PRIVACY_REDACTED", can_recover: false, base_revision: "protected", actor_admin_id: "admin", result_id: null, member_ids: [] }
    await act(async () => root.render(createElement(MatchSessionView, { session: { id: "ui-session", status: "draft", round_id: "round", session_name: "测试", total_candidates: 5, total_matched: 0, total_unmatched: 5, results_ready: true }, results: [], diagnostics: [], candidates: [], initialAdjustments: [record] })))
    expect(document.body.textContent).toContain("本次冻结范围 5 人 · 符合资格 3 人 · 未通过 2 人")
    expect(document.body.textContent).toContain("已保护个人资料，详细原因不可用")
    expect(document.body.textContent).not.toContain("本次资格人数尚未保存")
    expect(button("沿原输入恢复")).toBeUndefined()
  })

  it("renders a protected cancellation-pool summary without inventing detailed reasons", async () => {
    await act(async () => root.render(createElement(RematchPool, { sessionId: "ui-session", poolMembers, poolSummary: { ...poolSummary, exclusion_summary: null }, auditReason: reason, onRefresh: mocks.refresh })))
    expect(document.body.textContent).toContain("本方案取消待配 3 人 · 符合资格 2 人 · 未通过 1 人")
    expect(document.body.textContent).toContain("已保护个人资料，详细原因不可用")
    expect(document.body.textContent).not.toContain("已取消报名 1 人")
  })

})
