// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { BoardActionResult, BoardDisplayRow, BoardMemberLockRequest, BoardRequest, BoardSnapshot } from "@/lib/matching/board-types"
import type { EnrichedMember } from "./match-detail-types"
import type { MatchSessionViewProps } from "./MatchSessionView"

const mocks = vi.hoisted(() => ({ pair: vi.fn(), multi: vi.fn(), rematch: vi.fn(), save: vi.fn(), load: vi.fn(), memberLock: vi.fn(), refresh: vi.fn(), lock: vi.fn(), unlock: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock("@/app/admin/matching/[id]/board-actions", () => ({ inspectBoardPair: mocks.pair, inspectBoardMultiMove: mocks.multi, rematchBoard: mocks.rematch, saveBoard: mocks.save, loadMatchingBoard: mocks.load, setBoardMemberLock: mocks.memberLock }))
vi.mock("@/app/admin/matching/[id]/actions", () => ({ confirmSession: vi.fn(), unpublishSession: vi.fn(), lockPair: mocks.lock, unlockPair: mocks.unlock }))
vi.mock("@/app/admin/matching/[id]/manual-actions", () => ({ recoverMatchingAdjustment: vi.fn() }))
import { MatchingBoardView } from "./MatchingBoardView"

const SLOT = "2026-11-02_下午"
const SESSION = "board-controls-session"
const LOCK_STORAGE = `matching-board-member-lock:${SESSION}`
const memberIds = ["A", "B", "M1", "M2", "M3", "U", "W"]
const members: EnrichedMember[] = memberIds.map((id) => ({
  id, record_source: null,
  member_identity: { full_name: `成员${id}`, nickname: null, gender: "male", school_name: null, hobby_tags: [], nationality: "", degree_level: null, department: null },
  member_interests: null, member_personality: null, member_boundaries: null,
}))
const person = (id: string) => members.find((member) => member.id === id)!
const commonAvailability = { "2026-11-03": ["晚上"], "2026-11-02": ["晚上", "下午", "上午"], "2026-11-01": ["下午"] }
function result(key: string, a: string, b: string | null, group: string[] | null = null): BoardDisplayRow {
  return { key, resultId: key, status: "draft", member_a_id: a, member_b_id: b, group_members: group, total_score: 70, score_breakdown: [], rank: 1, best_slot: SLOT, game_type: group ? "多人" : "双人" }
}
function fixture(): MatchSessionViewProps {
  const rows = [result("duo-ab", "A", "B"), result("multi", "M1", null, ["M1", "M2", "M3"])]
  const boardSnapshot: BoardSnapshot = {
    draft: { duos: [{ key: "duo-ab", resultId: "duo-ab", memberIds: ["A", "B"], bestSlot: SLOT }], multi: { key: "multi", resultId: "multi", memberIds: ["M1", "M2", "M3"], bestSlot: SLOT }, waitingDuoIds: ["W"], brokenPairs: [], unmatchedIds: ["U"] },
    rows, revisionToken: "revision-original", lockedResultIds: [], lockedMemberIds: [], cohortMemberIds: memberIds, canViewRaw: true,
    currentSubmissionPrefs: Object.fromEntries(memberIds.map((id) => [id, { availability: structuredClone(commonAvailability) }])),
  }
  return {
    session: { id: SESSION, session_name: "三池操作", status: "draft", results_ready: true, total_candidates: 7, total_matched: 5, total_unmatched: 2, round_id: "round", publication_version: 1 },
    results: rows.map((row) => ({ id: row.key, total_score: row.total_score, rank: row.rank, status: "draft", best_slot: row.best_slot, score_breakdown: row.score_breakdown, member_a: person(row.member_a_id), member_b: row.member_b_id ? person(row.member_b_id) : null, group_members: row.group_members, group_member_details: row.group_members?.map(person) ?? null })),
    diagnostics: [], candidates: [], boardSnapshot, boardMembers: members, canViewRawSubmissions: true,
  }
}

let root: Root
let props: MatchSessionViewProps
let authority: BoardSnapshot
function button(label: string, within: ParentNode = document) {
  const found = [...within.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.getAttribute("aria-label") === label || item.textContent?.trim() === label)
  if (!found) throw new Error(`Button not found: ${label}`)
  return found
}
function pool(id: string) { return document.querySelector<HTMLElement>(`[data-board-drop-pool="${id}"]`)! }
function poolIds(id: string) { return [...pool(id).querySelectorAll<HTMLElement>("[data-member-id]")].map((node) => node.dataset.memberId) }
const inputReason = () => document.getElementById("board-audit-reason") as HTMLInputElement
async function click(label: string, within?: ParentNode) { await act(async () => button(label, within).click()) }
async function openMember(id: string) { await act(async () => document.querySelector<HTMLButtonElement>(`[data-member-id="${id}"]`)!.click()) }
async function render() { await act(async () => root.render(createElement(MatchingBoardView, props))) }
async function dragToPool(id: string, target: string) {
  vi.useFakeTimers()
  const source = document.querySelector<HTMLButtonElement>(`[data-member-id="${id}"]`)!
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => pool(target)) })
  const event = (type: string) => {
    const value = new MouseEvent(type, { bubbles: true, button: 0, clientX: 10, clientY: 10 })
    Object.defineProperty(value, "pointerId", { value: 1 })
    return value
  }
  await act(async () => source.dispatchEvent(event("pointerdown")))
  await act(async () => vi.advanceTimersByTime(350))
  await act(async () => source.dispatchEvent(event("pointerup")))
  await act(async () => vi.advanceTimersByTime(0))
  vi.useRealTimers()
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
  mocks.memberLock.mockImplementation(async (request: BoardMemberLockRequest) => {
    authority = { ...authority, lockedMemberIds: request.locked ? [...new Set([...authority.lockedMemberIds, request.memberId])] : authority.lockedMemberIds.filter((id) => id !== request.memberId), revisionToken: request.locked ? "revision-locked" : "revision-unlocked" }
    return { success: true }
  })
  mocks.pair.mockImplementation(async (request: BoardRequest & { memberIds: [string, string] }): Promise<BoardActionResult> => {
    const [a, b] = request.memberIds
    return { passed: true, draft: { ...request.draft, duos: [...request.draft.duos, { key: "restored-ab", memberIds: [a, b], bestSlot: SLOT }], brokenPairs: request.draft.brokenPairs.filter((pair) => !pair.memberIds.includes(a) && !pair.memberIds.includes(b)), waitingDuoIds: request.draft.waitingDuoIds.filter((id) => id !== a && id !== b), unmatchedIds: request.draft.unmatchedIds.filter((id) => id !== a && id !== b) }, rows: [result("restored-ab", a, b)] }
  })
  mocks.lock.mockImplementation(async (id: string) => { authority.lockedResultIds = [...new Set([...authority.lockedResultIds, id])]; authority.revisionToken = "revision-group-locked"; return {} })
  mocks.unlock.mockImplementation(async (id: string) => { authority.lockedResultIds = authority.lockedResultIds.filter((lockedId) => lockedId !== id); authority.revisionToken = "revision-group-unlocked"; return {} })
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe("matching board connection controls", () => {
  it("splits with the outer ampersand and restores after server inspection with no dialog or implicit save", async () => {
    await render()
    await click("解除 成员A与成员B的配对")
    expect(document.querySelector('[data-duo-key="duo-ab"]')).toBeNull()
    expect(document.querySelector('[data-broken-pair="duo-ab"] [aria-label="配对已解除"]')).not.toBeNull()
    expect(mocks.pair).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
    expect(poolIds("duo")).toEqual(["A", "B", "W"])
    await click("恢复 成员A与成员B的配对")
    expect(mocks.pair).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ sessionId: SESSION, expectedRevision: "revision-original", memberIds: ["A", "B"], draft: expect.objectContaining({ duos: [], waitingDuoIds: ["W", "A", "B"] }) }))
    expect(document.querySelector('[data-broken-pair="duo-ab"]')).toBeNull()
    expect(document.querySelector('[data-duo-key="duo-ab"]')).not.toBeNull()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.textContent).toContain("等待保存")
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("retains the broken connection when the compatibility inspection rejects restoration", async () => {
    mocks.pair.mockResolvedValue({ passed: false, reasons: ["这两位成员没有共同时间"] })
    await render()
    await click("解除 成员A与成员B的配对")
    await click("恢复 成员A与成员B的配对")
    expect(document.querySelector('[data-broken-pair="duo-ab"]')).not.toBeNull()
    expect(document.querySelector('[data-duo-key="restored-ab"]')).toBeNull()
    expect(document.body.textContent).toContain("这两位成员没有共同时间")
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("allows splitting with one pinned member but blocks their menu and drag moves out of the duo pool", async () => {
    props.boardSnapshot!.lockedMemberIds = ["A"]
    await render()
    expect(button("解除 成员A与成员B的配对").disabled).toBe(false)
    await click("解除 成员A与成员B的配对")
    await openMember("A")
    expect(button("移至多人池").disabled).toBe(true)
    expect(button("移至未匹配池").disabled).toBe(true)
    await click("关闭个人资料")
    await dragToPool("A", "unmatched")
    expect(poolIds("duo")).toContain("A")
    expect(poolIds("unmatched")).not.toContain("A")
    expect(document.body.textContent).toContain("先解除个人锁定")
    await openMember("B")
    expect(button("移至未匹配池").disabled).toBe(false)
    await click("移至未匹配池")
    expect(poolIds("unmatched")).toEqual(["U", "B"])
    expect(poolIds("duo")).toEqual(["W", "A"])
    expect(mocks.multi).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it.each(["both-members", "result"])("preserves the pair when locked by %s", async (kind) => {
    if (kind === "both-members") props.boardSnapshot!.lockedMemberIds = ["A", "B"]
    else props.boardSnapshot!.lockedResultIds = ["duo-ab"]
    await render()
    expect(button("解除 成员A与成员B的配对").disabled).toBe(true)
    await click("解除 成员A与成员B的配对")
    await openMember("A")
    expect(button("取消匹配").disabled).toBe(true)
    expect(document.querySelector('[data-duo-key="duo-ab"]')).not.toBeNull()
    expect(mocks.pair).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })
})

describe("matching board individual lock requests", () => {
  it("locks and unlocks without a reason using desired states, fresh revisions and authoritative snapshots", async () => {
    await render()
    expect(inputReason().value).toBe("")
    expect(button("锁定 成员A在双人池").disabled).toBe(false)
    await click("锁定 成员A在双人池")
    const first = mocks.memberLock.mock.calls[0][0] as BoardMemberLockRequest
    expect(first).toEqual({ sessionId: SESSION, memberId: "A", locked: true, expectedRevision: "revision-original", operationId: expect.stringMatching(/^[0-9a-f-]{36}$/) })
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(SESSION)
    expect(button("解锁 成员A在双人池").getAttribute("aria-pressed")).toBe("true")
    expect(sessionStorage.getItem(LOCK_STORAGE)).toBeNull()
    await click("解锁 成员A在双人池")
    const second = mocks.memberLock.mock.calls[1][0] as BoardMemberLockRequest
    expect(second).toMatchObject({ sessionId: SESSION, memberId: "A", locked: false, expectedRevision: "revision-locked" })
    expect(second.operationId).not.toBe(first.operationId)
    expect(button("锁定 成员A在双人池").getAttribute("aria-pressed")).toBe("false")
    expect(mocks.load).toHaveBeenCalledTimes(2)
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(inputReason().value).toBe("")
  })

  it.each(["unknown-response", "network-error"])("retries %s with the identical desired state, operation ID and revision", async (failure) => {
    if (failure === "network-error") mocks.memberLock.mockRejectedValueOnce(new Error("connection interrupted"))
    else mocks.memberLock.mockResolvedValueOnce({ unknown: true, error: "个人锁定结果待确认" })
    await render()
    await click("锁定 成员A在双人池")
    const first = mocks.memberLock.mock.calls[0][0]
    expect(JSON.parse(sessionStorage.getItem(LOCK_STORAGE)!)).toEqual(first)
    expect(mocks.load).not.toHaveBeenCalled()
    expect(button("解除 成员A与成员B的配对").disabled).toBe(true)
    expect(button("重新匹配").disabled).toBe(true)
    expect(button("保存调整").disabled).toBe(true)
    const leave = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(leave)
    expect(leave.defaultPrevented).toBe(true)
    await click("核对个人锁定")
    expect(mocks.memberLock.mock.calls[1][0]).toEqual(first)
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(SESSION)
    expect(sessionStorage.getItem(LOCK_STORAGE)).toBeNull()
    expect(button("解锁 成员A在双人池").getAttribute("aria-pressed")).toBe("true")
    const after = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
  })

  it("preserves the receipt request if the write succeeds but the authoritative refresh fails", async () => {
    mocks.load.mockRejectedValueOnce(new Error("read unavailable"))
    await render()
    await click("锁定 成员A在双人池")
    const first = mocks.memberLock.mock.calls[0][0]
    expect(document.body.textContent).toContain("暂时无法读取新状态")
    expect(JSON.parse(sessionStorage.getItem(LOCK_STORAGE)!)).toEqual(first)
    expect(button("锁定 成员A在双人池").disabled).toBe(true)
    await click("核对个人锁定")
    expect(mocks.memberLock.mock.calls[1][0]).toEqual(first)
    expect(button("解锁 成员A在双人池").getAttribute("aria-pressed")).toBe("true")
    expect(sessionStorage.getItem(LOCK_STORAGE)).toBeNull()
  })

  it("recovers an interrupted member-lock request from storage without generating a replacement operation", async () => {
    const pending: BoardMemberLockRequest = { sessionId: SESSION, memberId: "W", locked: true, expectedRevision: "revision-before-reload", operationId: "10000000-0000-4000-8000-000000000001" }
    sessionStorage.setItem(LOCK_STORAGE, JSON.stringify(pending))
    await render()
    expect(button("锁定 成员W在双人池").disabled).toBe(true)
    await click("核对个人锁定")
    expect(mocks.memberLock).toHaveBeenCalledExactlyOnceWith(pending)
    expect(button("解锁 成员W在双人池").getAttribute("aria-pressed")).toBe("true")
  })

  it("does not mutate member locks while a local pairing edit is unsaved", async () => {
    await render()
    await click("解除 成员A与成员B的配对")
    expect(button("锁定 成员A在双人池").disabled).toBe(true)
    await click("锁定 成员A在双人池")
    expect(mocks.memberLock).not.toHaveBeenCalled()
    expect(document.querySelector('[data-broken-pair="duo-ab"]')).not.toBeNull()
  })
})

describe("matching board multiplayer controls", () => {
  it.each([false, true])("changes multiplayer lock state without a typed reason, initially locked=%s", async (locked) => {
    props.boardSnapshot!.lockedResultIds = locked ? ["multi"] : []
    authority = structuredClone(props.boardSnapshot!)
    await render()
    expect(inputReason().value).toBe("")
    const label = locked ? "解除锁定" : "锁定"
    expect(button(label, pool("multi")).disabled).toBe(false)
    await click(label, pool("multi"))
    expect(locked ? mocks.unlock : mocks.lock).toHaveBeenCalledExactlyOnceWith("multi", locked ? "三池子页面：解除多人池锁定" : "三池子页面：锁定多人池")
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(SESSION)
    expect(button(locked ? "锁定" : "解除锁定", pool("multi")).disabled).toBe(false)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })

  it("shows all common times beyond the first three and explains the recommendation order", async () => {
    await render()
    const list = pool("multi").querySelector('[aria-label="全部共同时间段"]')!
    const times = [...list.children].map((child) => child.textContent)
    expect(times).toEqual([
      "推荐 12026-11-02 下午（当前）", "推荐 22026-11-01 下午", "推荐 32026-11-02 上午", "共同时间2026-11-02 晚上", "共同时间2026-11-03 晚上",
    ])
    expect(pool("multi").textContent).toContain("共 5 个全员共同时间")
    expect(pool("multi").textContent).toContain("推荐顺序不代表匹配评分")
  })

  it("does not use stale fallback preferences when a current captured member is missing availability", async () => {
    delete props.boardSnapshot!.currentSubmissionPrefs!.M3
    props.submissionPrefs = Object.fromEntries(["M1", "M2", "M3"].map((id) => [id, { game_type_pref: "多人", gender_pref: "都可以", availability: commonAvailability }]))
    await render()
    expect(pool("multi").textContent).toContain("部分成员缺少可用时间")
    expect(pool("multi").querySelector('[aria-label="全部共同时间段"]')).toBeNull()
    expect(pool("multi").textContent).not.toContain("推荐 1")
    expect(pool("multi").textContent).toContain("当前安排：2026-11-02 下午")
  })

  it("keeps full availability private for ordinary admins even if raw props accidentally reach the component", async () => {
    props.canViewRawSubmissions = false
    props.boardSnapshot!.canViewRaw = false
    await render()
    expect(pool("multi").textContent).toContain("当前安排：2026-11-02 下午")
    expect(pool("multi").textContent).not.toContain("2026-11-03")
    expect(pool("multi").querySelector('[aria-label="全部共同时间段"]')).toBeNull()
  })
})
