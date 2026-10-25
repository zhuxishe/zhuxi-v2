// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { BoardDraft, BoardSnapshot } from "@/lib/matching/board-types"
import type { MatchSessionViewProps } from "./MatchSessionView"

const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn(), load: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock("@/app/admin/matching/[id]/board-actions", () => ({ inspectBoardPair: vi.fn(), inspectBoardMultiMove: vi.fn(), rematchBoard: vi.fn(), saveBoard: mocks.save, loadMatchingBoard: mocks.load }))
vi.mock("@/app/admin/matching/[id]/actions", () => ({ confirmSession: vi.fn(), unpublishSession: vi.fn(), lockPair: vi.fn(), unlockPair: vi.fn() }))
vi.mock("@/app/admin/matching/[id]/manual-actions", () => ({ recoverMatchingAdjustment: vi.fn() }))
import { MatchingBoardView } from "./MatchingBoardView"

let root: Root
let props: MatchSessionViewProps
const key = "matching-board-save:board-lifecycle"
function fixture(): MatchSessionViewProps {
  const draft: BoardDraft = { duos: [], multi: null, waitingDuoIds: [], brokenPairs: [], unmatchedIds: ["U", "V"] }
  const snapshot: BoardSnapshot = { draft, rows: [], revisionToken: "current-revision", lockedResultIds: [], cohortMemberIds: ["U", "V"], canViewRaw: true }
  return { session: { id: "board-lifecycle", session_name: "生命周期测试", round_id: "round", status: "draft", results_ready: true, publication_version: 1, total_candidates: 2, total_matched: 0, total_unmatched: 2 }, results: [], diagnostics: [], candidates: [], boardSnapshot: snapshot,
    boardMembers: ["U", "V"].map((id) => ({ id, record_source: null, member_identity: { full_name: id, nickname: null, school_name: null, gender: "male", hobby_tags: [], nationality: "", degree_level: null, department: null }, member_interests: null, member_personality: null, member_boundaries: null })) }
}
async function render() { await act(async () => root.render(createElement(MatchingBoardView, props))) }
function button(label: string) { return [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label) }
async function click(label: string) { const target = button(label); if (!target) throw new Error(`Missing button ${label}`); await act(async () => target.click()) }
function inPool(pool: string, id: string) { return !!document.querySelector(`[data-board-drop-pool="${pool}"] [data-member-id="${id}"]`) }
async function moveU() {
  await act(async () => document.querySelector<HTMLButtonElement>('[data-member-id="U"]')!.click())
  await click("移至双人池")
}
function storedPending() {
  return { sessionId: "board-lifecycle", operationId: "10000000-0000-4000-8000-000000000001", expectedRevision: "old-revision", reason: "保留原来的人工调整", draft: { ...props.boardSnapshot!.draft, waitingDuoIds: ["U"], unmatchedIds: ["V"] } }
}
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); sessionStorage.clear()
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query.includes("min-width: 1024px"), media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })))
  vi.spyOn(window, "confirm").mockReturnValue(true)
  document.body.innerHTML = '<div id="root"></div>'; root = createRoot(document.getElementById("root")!); props = fixture()
  mocks.load.mockImplementation(async () => props.boardSnapshot)
})
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear() })

describe("matching board same-revision and recovery lifecycle", () => {
  it("unlocks the editor after an already-committed pending save is confirmed at the same revision", async () => {
    const pending = storedPending(); props.boardSnapshot!.draft = pending.draft
    sessionStorage.setItem(key, JSON.stringify(pending)); mocks.save.mockResolvedValue({ success: true, revisionToken: "current-revision" })
    await render(); await click("核对上次保存"); await render()
    expect(button("核对上次保存")).toBeUndefined()
    expect((document.getElementById("board-audit-reason") as HTMLInputElement).disabled).toBe(false)
    expect(button("重新匹配")?.disabled).toBe(false)
    expect(sessionStorage.getItem(key)).toBeNull()
    await act(async () => document.querySelector<HTMLButtonElement>('[data-member-id="V"]')!.click())
    await click("移至双人池")
    const leave = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(leave)
    expect(leave.defaultPrevented).toBe(true)
  })
  it("replaces restored temporary pair keys with saved canonical result IDs after a same-revision confirmation", async () => {
    const savedDraft: BoardDraft = { duos: [{ key: "server-result", resultId: "server-result", memberIds: ["U", "V"], bestSlot: "2026-11-01_下午" }], multi: null, waitingDuoIds: [], brokenPairs: [], unmatchedIds: [] }
    props.boardSnapshot!.draft = savedDraft
    props.boardSnapshot!.rows = [{ key: "server-result", resultId: "server-result", status: "draft", member_a_id: "U", member_b_id: "V", group_members: null, best_slot: "2026-11-01_下午", total_score: 73, score_breakdown: null, rank: 1, game_type: "双人" }]
    const pending = { sessionId: "board-lifecycle", operationId: "10000000-0000-4000-8000-000000000001", expectedRevision: "old-revision", reason: "保存新的双人组", draft: { ...savedDraft, duos: [{ key: "temporary-pair", memberIds: ["U", "V"], bestSlot: "2026-11-01_下午" }] } }
    sessionStorage.setItem(key, JSON.stringify(pending)); mocks.save.mockResolvedValue({ success: true, revisionToken: "current-revision" })
    await render(); await click("核对上次保存"); await render()
    expect(document.querySelector('[data-duo-key="server-result"]')).not.toBeNull()
    expect(document.querySelector('[data-duo-key="temporary-pair"]')).toBeNull()
    expect(document.body.textContent).not.toContain("尚未保存")
  })
  it("discards local edits on explicit refresh even when the server revision did not change, then warns for later edits", async () => {
    await render(); await moveU(); expect(inPool("duo", "U")).toBe(true)
    await click("刷新调整记录"); await render()
    expect(inPool("unmatched", "U")).toBe(true)
    expect(inPool("duo", "U")).toBe(false)
    await moveU()
    const leave = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(leave)
    expect(leave.defaultPrevented).toBe(true)
  })
  it("keeps the original operation recoverable if saving succeeded but loading canonical results fails", async () => {
    const pending = storedPending(); sessionStorage.setItem(key, JSON.stringify(pending))
    mocks.save.mockResolvedValue({ success: true, revisionToken: "saved-revision" })
    mocks.load.mockRejectedValueOnce(new Error("temporary read failure")).mockResolvedValueOnce(props.boardSnapshot)
    await render(); await click("核对上次保存")
    expect(button("核对上次保存")).toBeDefined()
    expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual(pending)
    await click("核对上次保存")
    expect(mocks.save.mock.calls[0][0]).toEqual(pending)
    expect(mocks.save.mock.calls[1][0]).toEqual(pending)
    expect(button("核对上次保存")).toBeUndefined()
    expect(sessionStorage.getItem(key)).toBeNull()
  })
  it("preserves the recovered local draft when its old save is definitively rejected", async () => {
    const pending = storedPending(); sessionStorage.setItem(key, JSON.stringify(pending))
    mocks.save.mockResolvedValue({ error: "方案或人员资料已变化，本次未保存。请刷新后重新调整。", operationId: pending.operationId })
    await render(); await click("核对上次保存")
    // Either restore the rejected draft visibly or retain a recoverable copy;
    // a rejection must not delete the only copy of the user's prior work.
    expect(inPool("duo", "U") || sessionStorage.getItem(key) !== null).toBe(true)
  })
})
