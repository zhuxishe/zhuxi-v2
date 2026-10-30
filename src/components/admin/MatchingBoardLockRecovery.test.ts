// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { BoardDraft, BoardMemberLockRequest, BoardSnapshot } from "@/lib/matching/board-types"
import type { MatchSessionViewProps } from "./MatchSessionView"

const mocks = vi.hoisted(() => ({ save: vi.fn(), load: vi.fn(), memberLock: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock("@/app/admin/matching/[id]/board-actions", () => ({ recommendBoardSmallGroups: vi.fn(async () => ({ success: true, recommendations: [] })), inspectBoardSmallGroupCandidates: vi.fn(async () => ({ success: true, passed: true })), inspectBoardPair: vi.fn(), inspectBoardMultiMove: vi.fn(), rematchBoard: vi.fn(), saveBoard: mocks.save, loadMatchingBoard: mocks.load, setBoardMemberLock: mocks.memberLock }))
vi.mock("@/app/admin/matching/[id]/actions", () => ({ confirmSession: vi.fn(), unpublishSession: vi.fn(), lockPair: vi.fn(), unlockPair: vi.fn() }))
vi.mock("@/app/admin/matching/[id]/manual-actions", () => ({ recoverMatchingAdjustment: vi.fn() }))
import { MatchingBoardView } from "./MatchingBoardView"

const SESSION = "published-recovery"
const LOCK_STORAGE = `matching-board-member-lock:${SESSION}`
const SAVE_STORAGE = `matching-board-save:${SESSION}`
const SLOT = "2026-11-02_下午"
type SaveRequest = { sessionId: string; draft: BoardDraft; expectedRevision: string; operationId: string; reason: string }
function fixture(): MatchSessionViewProps {
  const boardSnapshot: BoardSnapshot = {
    draft: { duos: [{ key: "duo", resultId: "duo", memberIds: ["A", "B"], bestSlot: SLOT }], multi: null, waitingDuoIds: [], brokenPairs: [], unmatchedIds: ["U"] },
    rows: [{ key: "duo", resultId: "duo", status: "draft", member_a_id: "A", member_b_id: "B", group_members: null, total_score: 70, score_breakdown: null, rank: 1, best_slot: SLOT, game_type: "双人" }],
    revisionToken: "before-operation", lockedResultIds: [], lockedMemberIds: [], cohortMemberIds: ["A", "B", "U"], canViewRaw: true,
  }
  return {
    session: { id: SESSION, session_name: "发布后恢复", status: "draft", results_ready: true, total_candidates: 3, total_matched: 2, total_unmatched: 1, round_id: "round", publication_version: 0 },
    results: [], diagnostics: [], candidates: [], boardSnapshot, canViewRawSubmissions: true,
    boardMembers: ["A", "B", "U"].map((id) => ({ id, record_source: null, member_identity: { full_name: id, nickname: null, gender: "male", school_name: null, hobby_tags: [], nationality: "", degree_level: null, department: null }, member_interests: null, member_personality: null, member_boundaries: null })),
  }
}
let root: Root
let props: MatchSessionViewProps
let authority: BoardSnapshot
function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.getAttribute("aria-label") === label || item.textContent?.trim() === label)
}
async function click(label: string) {
  const target = button(label)
  if (!target) throw new Error(`Missing button: ${label}`)
  await act(async () => target.click())
}
async function render() {
  // MatchSessionView uses this key, so a newer server revision restores pending requests after remount.
  await act(async () => root.render(createElement(MatchingBoardView, { ...props, key: `${SESSION}:${props.boardSnapshot?.revisionToken ?? props.session.status}` })))
}
async function setReason(value: string) {
  const input = document.getElementById("board-audit-reason") as HTMLInputElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
function expectNoLeaveWarning() {
  const event = new Event("beforeunload", { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
}
async function publishAndReload() {
  authority.revisionToken = "after-publish"
  props = { ...props, session: { ...props.session, status: "confirmed", publication_version: 1 }, boardSnapshot: structuredClone(authority) }
  await render()
}

beforeEach(() => {
  vi.resetAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query.includes("min-width: 1024px"), media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })))
  sessionStorage.clear()
  document.body.innerHTML = '<div id="root"></div>'
  root = createRoot(document.getElementById("root")!)
  props = fixture()
  authority = structuredClone(props.boardSnapshot!)
  mocks.load.mockImplementation(async () => structuredClone(authority))
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear()
})

describe("pending board receipts remain recoverable after publication", () => {
  it("recovers the identical committed lock request after another administrator publishes, then remains read-only", async () => {
    mocks.memberLock.mockImplementationOnce(async (request: BoardMemberLockRequest) => {
      authority.lockedMemberIds = [request.memberId]
      authority.revisionToken = "after-lock"
      return { unknown: true, operationId: request.operationId, error: "提交后的响应丢失" }
    }).mockResolvedValueOnce({ success: true, revisionToken: "after-lock" })
    await render()
    await click("锁定 A在双人池")
    const original = mocks.memberLock.mock.calls[0][0] as BoardMemberLockRequest
    expect(JSON.parse(sessionStorage.getItem(LOCK_STORAGE)!)).toEqual(original)
    expect(mocks.load).not.toHaveBeenCalled()
    await publishAndReload()
    expect(button("核对个人锁定")?.disabled).toBe(false)
    expect(button("解锁 A在双人池")?.disabled).toBe(true)
    await click("核对个人锁定")
    expect(mocks.memberLock.mock.calls[1][0]).toEqual(original)
    expect(mocks.memberLock).toHaveBeenCalledTimes(2)
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(SESSION)
    expect(sessionStorage.getItem(LOCK_STORAGE)).toBeNull()
    expect(button("核对个人锁定")).toBeUndefined()
    expect(button("解锁 A在双人池")?.getAttribute("aria-pressed")).toBe("true")
    expect(button("解锁 A在双人池")?.disabled).toBe(true)
    expect(button("解除 A与B的配对")?.disabled).toBe(true)
    expect(button("重新匹配")).toBeUndefined()
    expect(button("保存调整")).toBeUndefined()
    expectNoLeaveWarning()
    await click("解锁 A在双人池")
    expect(mocks.memberLock).toHaveBeenCalledTimes(2)
  })

  it("recovers the identical committed save after publication without re-enabling editing", async () => {
    mocks.save.mockImplementationOnce(async (request: SaveRequest) => {
      authority = { ...authority, draft: structuredClone(request.draft), rows: [], revisionToken: "after-save" }
      return { unknown: true, operationId: request.operationId, error: "保存提交后的响应丢失" }
    }).mockResolvedValueOnce({ success: true, revisionToken: "after-save" })
    await render()
    await click("解除 A与B的配对")
    await setReason("已确认时间后解除双人配对")
    expect(button("保存调整")?.disabled).toBe(false)
    await click("保存调整")
    const original = mocks.save.mock.calls[0][0] as SaveRequest
    expect(JSON.parse(sessionStorage.getItem(SAVE_STORAGE)!)).toEqual(original)
    expect(mocks.load).not.toHaveBeenCalled()
    await publishAndReload()
    expect(button("核对上次保存")?.disabled).toBe(false)
    await click("核对上次保存")
    expect(mocks.save.mock.calls[1][0]).toEqual(original)
    expect(mocks.save).toHaveBeenCalledTimes(2)
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(SESSION)
    expect(sessionStorage.getItem(SAVE_STORAGE)).toBeNull()
    expect(button("核对上次保存")).toBeUndefined()
    expect(button("保存调整")).toBeUndefined()
    expect(button("恢复 A与B的配对")?.disabled).toBe(true)
    expect(button("锁定 A在双人池")?.disabled).toBe(true)
    expect(button("重新匹配")).toBeUndefined()
    expectNoLeaveWarning()
    await click("恢复 A与B的配对")
    expect(mocks.save).toHaveBeenCalledTimes(2)
  })

  it("recovers a pending lock with a missing editing token and read-only props", async () => {
    const original: BoardMemberLockRequest = { sessionId: SESSION, memberId: "A", locked: true, expectedRevision: "before-operation", operationId: "10000000-0000-4000-8000-000000000001" }
    sessionStorage.setItem(LOCK_STORAGE, JSON.stringify(original))
    props.readOnly = true
    props.boardSnapshot!.revisionToken = ""
    props.boardUnavailable = true
    authority.lockedMemberIds = ["A"]
    authority.revisionToken = "after-lock"
    mocks.memberLock.mockResolvedValue({ success: true, revisionToken: "after-lock" })
    await render()
    await click("核对个人锁定")
    expect(mocks.memberLock).toHaveBeenCalledExactlyOnceWith(original)
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(SESSION)
    expect(sessionStorage.getItem(LOCK_STORAGE)).toBeNull()
    expect(button("解锁 A在双人池")?.disabled).toBe(true)
    expect(button("解除 A与B的配对")?.disabled).toBe(true)
    expectNoLeaveWarning()
  })
})
