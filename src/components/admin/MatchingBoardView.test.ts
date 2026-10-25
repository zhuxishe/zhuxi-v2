// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { BoardActionResult, BoardDisplayRow, BoardDraft, BoardRequest, BoardSnapshot } from "@/lib/matching/board-types"
import type { EnrichedMatchResult, EnrichedMember } from "./match-detail-types"
import type { MatchSessionViewProps } from "./MatchSessionView"

const mocks = vi.hoisted(() => ({ pair: vi.fn(), multi: vi.fn(), rematch: vi.fn(), save: vi.fn(), load: vi.fn(), refresh: vi.fn(), publish: vi.fn(), unpublish: vi.fn(), lock: vi.fn(), unlock: vi.fn(), recover: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock("@/app/admin/matching/[id]/board-actions", () => ({ inspectBoardPair: mocks.pair, inspectBoardMultiMove: mocks.multi, rematchBoard: mocks.rematch, saveBoard: mocks.save, loadMatchingBoard: mocks.load }))
vi.mock("@/app/admin/matching/[id]/actions", () => ({ confirmSession: mocks.publish, unpublishSession: mocks.unpublish, lockPair: mocks.lock, unlockPair: mocks.unlock }))
vi.mock("@/app/admin/matching/[id]/manual-actions", () => ({ recoverMatchingAdjustment: mocks.recover }))
import { MatchingBoardView } from "./MatchingBoardView"

const SLOT = "2026-11-01_下午"
const reason = "核对个人时间后统一调整"
const ids = ["A", "B", "C", "D", "M1", "M2", "M3", "U", "V", "W"]
const members: EnrichedMember[] = ids.map((id) => ({
  id, record_source: null, member_identity: { full_name: `成员${id}`, nickname: null, gender: "male", school_name: null, hobby_tags: [], nationality: "", degree_level: null, department: null },
  member_interests: null, member_personality: null, member_boundaries: null,
}))
const person = (id: string) => members.find((member) => member.id === id)!
function row(key: string, a: string, b: string | null, group: string[] | null = null): BoardDisplayRow {
  return { key, resultId: key, status: "draft", member_a_id: a, member_b_id: b, group_members: group, total_score: 70, score_breakdown: [], rank: 1, best_slot: SLOT, game_type: group ? "多人" : "双人" }
}
function fixture(): MatchSessionViewProps {
  const rows = [row("duo-ab", "A", "B"), row("duo-cd", "C", "D"), row("multi", "M1", null, ["M1", "M2", "M3"])]
  const draft: BoardDraft = { duos: [{ key: "duo-ab", resultId: "duo-ab", memberIds: ["A", "B"], bestSlot: SLOT }, { key: "duo-cd", resultId: "duo-cd", memberIds: ["C", "D"], bestSlot: SLOT }], multi: { key: "multi", resultId: "multi", memberIds: ["M1", "M2", "M3"], bestSlot: SLOT }, waitingDuoIds: ["W"], brokenPairs: [], unmatchedIds: ["U", "V"] }
  const boardSnapshot: BoardSnapshot = { draft, rows, revisionToken: "revision-current", lockedResultIds: [], cohortMemberIds: ids, canViewRaw: true }
  const results: EnrichedMatchResult[] = rows.map((item) => ({ id: item.key, total_score: item.total_score, rank: item.rank, status: "draft", best_slot: item.best_slot, score_breakdown: item.score_breakdown, member_a: person(item.member_a_id), member_b: item.member_b_id ? person(item.member_b_id) : null, group_members: item.group_members, group_member_details: item.group_members?.map(person) ?? null }))
  return { session: { id: "board-session", session_name: "三池交互", status: "draft", results_ready: true, total_candidates: 10, total_matched: 7, total_unmatched: 3, round_id: "round", publication_version: 2 }, results, diagnostics: [], candidates: [], boardSnapshot, boardMembers: members, canViewRawSubmissions: true }
}
let root: Root
let props: MatchSessionViewProps
let desktop: boolean
function button(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label)
  if (!found) throw new Error(`Button not found: ${label}`)
  return found
}
function pool(id: string) { return document.querySelector<HTMLElement>(`[data-board-drop-pool="${id}"]`)! }
function poolMemberIds(id: string) { return [...pool(id).querySelectorAll<HTMLElement>("[data-member-id]")].map((item) => item.dataset.memberId) }
async function click(label: string) { await act(async () => button(label).click()) }
async function openMember(id: string) {
  const trigger = document.querySelector<HTMLButtonElement>(`[data-member-id="${id}"]`)!
  await act(async () => trigger.click())
}
async function setReason() {
  const input = document.getElementById("board-audit-reason") as HTMLInputElement
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, reason); input.dispatchEvent(new Event("input", { bubbles: true })) })
}
async function selectMembers(...selectedIds: string[]) {
  for (const id of selectedIds) await act(async () => document.querySelector<HTMLInputElement>(`input[aria-label="选择 成员${id}"]`)!.click())
}
async function render(overrides: Partial<MatchSessionViewProps> = {}) {
  props = { ...props, ...overrides }
  await act(async () => root.render(createElement(MatchingBoardView, props)))
}
function pairedDraft(current: BoardDraft, a = "U", b = "V"): BoardDraft {
  return { ...current, duos: [...current.duos, { key: "new-pair", memberIds: [a, b], bestSlot: SLOT }], waitingDuoIds: current.waitingDuoIds.filter((id) => id !== a && id !== b), unmatchedIds: current.unmatchedIds.filter((id) => id !== a && id !== b) }
}

function canonicalSnapshot(): BoardSnapshot {
  const baseline = props.boardSnapshot!
  const savedDraft = mocks.save.mock.calls.at(-1)?.[0]?.draft as BoardDraft | undefined
  const draft = JSON.parse(JSON.stringify(savedDraft ?? baseline.draft)) as BoardDraft
  draft.duos = draft.duos.map((duo) => ({ ...duo, key: duo.resultId ?? `saved-${duo.key}`, resultId: duo.resultId ?? `saved-${duo.key}` }))
  if (draft.multi) draft.multi = { ...draft.multi, key: draft.multi.resultId ?? `saved-${draft.multi.key}`, resultId: draft.multi.resultId ?? `saved-${draft.multi.key}` }
  const rows = draft.duos.map((duo) => ({ ...row(duo.key, ...duo.memberIds), best_slot: duo.bestSlot }))
  if (draft.multi) rows.push({ ...row(draft.multi.key, draft.multi.memberIds[0], null, draft.multi.memberIds), best_slot: draft.multi.bestSlot })
  return { ...baseline, draft, rows, revisionToken: "revision-after-save" }
}

beforeEach(() => {
  vi.resetAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  sessionStorage.clear()
  desktop = true
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query.includes("min-width: 1024px") && desktop, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })))
  document.body.innerHTML = '<div id="root"></div>'
  root = createRoot(document.getElementById("root")!)
  props = fixture()
  mocks.pair.mockImplementation(async (request: BoardRequest & { memberIds: [string, string] }): Promise<BoardActionResult> => ({ passed: true, draft: pairedDraft(request.draft, ...request.memberIds), rows: [...props.boardSnapshot!.rows, row("new-pair", ...request.memberIds)] }))
  mocks.save.mockResolvedValue({ success: true })
  mocks.load.mockImplementation(async () => canonicalSnapshot())
  mocks.publish.mockResolvedValue({})
  mocks.unpublish.mockResolvedValue({})
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe("matching three-pool board editing", () => {
  it("splits locally, shows a grey original-pair connection and leaves the remaining partner in the duo pool", async () => {
    await render()
    await openMember("A")
    expect(document.body.textContent).toContain("成员A & 成员B")
    await click("取消匹配")
    expect(document.querySelector('[data-duo-key="duo-ab"]')).toBeNull()
    expect(document.querySelector('[data-broken-pair="duo-ab"] [aria-label="配对已解除"]')).not.toBeNull()
    expect(poolMemberIds("duo")).toEqual(expect.arrayContaining(["A", "B", "C", "D", "W"]))
    expect(mocks.save).not.toHaveBeenCalled()
    await openMember("A")
    await click("移至未匹配池")
    expect(poolMemberIds("unmatched")).toEqual(["U", "V", "A"])
    expect(poolMemberIds("duo")).toEqual(["C", "D", "W", "B"])
    expect(document.querySelector('[data-broken-pair="duo-ab"]')).toBeNull()
    expect(document.querySelector('[data-duo-key="duo-cd"]')).not.toBeNull()
    expect(poolMemberIds("multi")).toEqual(["M1", "M2", "M3"])
    expect(mocks.save).not.toHaveBeenCalled()
    expect(button("确认发布").disabled).toBe(true)
  })

  it("moves an unmatched person to the waiting duo area without modifying existing groups", async () => {
    await render()
    await openMember("U")
    await click("移至双人池")
    expect(poolMemberIds("unmatched")).toEqual(["V"])
    expect(poolMemberIds("duo")).toEqual(["A", "B", "C", "D", "W", "U"])
    expect(poolMemberIds("multi")).toEqual(["M1", "M2", "M3"])
    expect(mocks.pair).not.toHaveBeenCalled()
    expect(mocks.multi).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
    await click("撤销")
    expect(poolMemberIds("unmatched")).toEqual(["U", "V"])
    expect(poolMemberIds("duo")).toEqual(["A", "B", "C", "D", "W"])
    expect(document.body.textContent).not.toContain("尚未保存")
  })

  it("requires preview confirmation before pairing, permits cancellation, and undoes a confirmed preview locally", async () => {
    await render()
    await selectMembers("U", "V")
    await click("选中两人配对（2/2）")
    expect(mocks.pair).toHaveBeenCalledWith({ sessionId: "board-session", expectedRevision: "revision-current", draft: props.boardSnapshot!.draft, memberIds: ["U", "V"] })
    expect(document.querySelector('[data-duo-key="new-pair"]')).toBeNull()
    expect(poolMemberIds("unmatched")).toEqual(["U", "V"])
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("成员U & 成员V")
    await click("取消")
    expect(document.querySelector('[data-duo-key="new-pair"]')).toBeNull()
    await click("选中两人配对（2/2）")
    await click("确认配对")
    expect(poolMemberIds("unmatched")).toEqual([])
    expect(document.querySelector('[data-duo-key="new-pair"]')).not.toBeNull()
    expect(mocks.save).not.toHaveBeenCalled()
    await click("撤销")
    expect(poolMemberIds("unmatched")).toEqual(["U", "V"])
    expect(document.querySelector('[data-duo-key="new-pair"]')).toBeNull()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("long-presses a name and dropping on another waiting person opens the pair preview", async () => {
    await render()
    vi.useFakeTimers()
    const source = document.querySelector<HTMLButtonElement>('[data-member-id="U"]')!
    const target = document.querySelector<HTMLElement>('[data-board-drop-member="W"]')!
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => target) })
    const pointerEvent = (type: string, x = 10, y = 10) => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y })
      Object.defineProperty(event, "pointerId", { value: 1 })
      return event
    }
    await act(async () => source.dispatchEvent(pointerEvent("pointerdown")))
    await act(async () => vi.advanceTimersByTime(349))
    expect(mocks.pair).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(1))
    await act(async () => source.dispatchEvent(pointerEvent("pointerup", 20, 20)))
    await act(async () => vi.advanceTimersByTime(0))
    vi.useRealTimers()
    expect(mocks.pair).toHaveBeenCalledWith(expect.objectContaining({ memberIds: ["U", "W"] }))
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("成员U & 成员W")
    expect(document.querySelector('[data-duo-key="new-pair"]')).toBeNull()
    expect(poolMemberIds("unmatched")).toEqual(["U", "V"])
    await click("确认配对")
    expect(poolMemberIds("unmatched")).toEqual(["V"])
    expect(document.querySelector('[data-duo-key="new-pair"]')?.textContent).toContain("成员W")
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("sends the current unsaved draft to rematching and leaves waiting partners outside the unmatched scope", async () => {
    await render()
    await openMember("A"); await click("取消匹配")
    await openMember("A"); await click("移至未匹配池")
    mocks.rematch.mockImplementation(async ({ draft }: BoardRequest) => ({ draft: pairedDraft(draft, "A", "U"), rows: [...props.boardSnapshot!.rows, row("new-pair", "A", "U")] }))
    await click("重新匹配")
    const request = mocks.rematch.mock.calls[0][0] as BoardRequest
    expect(request.sessionId).toBe("board-session")
    expect(request.expectedRevision).toBe("revision-current")
    expect(request.draft.unmatchedIds).toEqual(["U", "V", "A"])
    expect(request.draft.waitingDuoIds).toEqual(["W", "B"])
    expect(request.draft.duos.map((duo) => duo.key)).toEqual(["duo-cd"])
    expect(request.draft.multi).toEqual(props.boardSnapshot!.draft.multi)
    expect(poolMemberIds("unmatched")).toEqual(["V"])
    expect(poolMemberIds("duo")).toEqual(["C", "D", "A", "U", "W", "B"])
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("keeps a rejected multi-pool move in unmatched and preserves the original pool and common slot", async () => {
    mocks.multi.mockImplementation(async ({ draft }: BoardRequest) => ({ passed: false, reasons: ["共同时间不一致"], draft }))
    await render()
    await openMember("U"); await click("移至多人池")
    expect(mocks.multi).toHaveBeenCalledWith({ sessionId: "board-session", expectedRevision: "revision-current", draft: props.boardSnapshot!.draft, memberId: "U" })
    expect(poolMemberIds("multi")).toEqual(["M1", "M2", "M3"])
    expect(pool("multi").textContent).toContain("2026-11-01 下午")
    expect(poolMemberIds("unmatched")).toEqual(["U", "V"])
    expect(document.body.textContent).toContain("共同时间不一致")
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("saves all local changes together and retries an unknown outcome with the identical operation and payload", async () => {
    mocks.save.mockResolvedValueOnce({ unknown: true, error: "保存结果待确认" }).mockResolvedValueOnce({ success: true })
    await render()
    await openMember("A"); await click("取消匹配")
    await openMember("A"); await click("移至未匹配池")
    await openMember("U"); await click("移至双人池")
    expect(mocks.save).not.toHaveBeenCalled()
    expect(button("保存调整").disabled).toBe(true)
    await setReason()
    await click("保存调整")
    const first = mocks.save.mock.calls[0][0]
    expect(first).toMatchObject({ sessionId: "board-session", expectedRevision: "revision-current", reason })
    expect(first.operationId).toMatch(/^[0-9a-f-]{36}$/)
    expect(first.draft.unmatchedIds).toEqual(["V", "A"])
    expect(first.draft.waitingDuoIds).toEqual(["W", "B", "U"])
    expect(JSON.parse(sessionStorage.getItem("matching-board-save:board-session")!)).toEqual(first)
    expect(button("重新匹配").disabled).toBe(true)
    expect(button("撤销").disabled).toBe(true)
    expect((document.getElementById("board-audit-reason") as HTMLInputElement).disabled).toBe(true)
    await click("核对上次保存")
    expect(mocks.save.mock.calls[1][0]).toEqual(first)
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith("board-session")
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem("matching-board-save:board-session")).toBeNull()
    expect(document.body.textContent).not.toContain("尚未保存")
    expect(button("撤销").disabled).toBe(true)
    expect(poolMemberIds("unmatched")).toEqual(["V", "A"])
    expect(poolMemberIds("duo")).toEqual(["C", "D", "W", "B", "U"])
  })

  it("warns before leaving local edits and keeps the identical save request after a network interruption", async () => {
    mocks.save.mockRejectedValueOnce(new Error("network interrupted")).mockResolvedValueOnce({ success: true })
    await render()
    await openMember("U"); await click("移至双人池")
    const leave = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(leave)
    expect(leave.defaultPrevented).toBe(true)
    await setReason(); await click("保存调整")
    const first = mocks.save.mock.calls[0][0]
    expect(document.body.textContent).toContain("保存结果待确认")
    await click("核对上次保存")
    expect(mocks.save.mock.calls[1][0]).toEqual(first)
    const afterSave = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(afterSave)
    expect(afterSave.defaultPrevented).toBe(false)
  })

  it("recovers a stored unknown save with its original reason, draft, revision and operation ID", async () => {
    const pending = { sessionId: "board-session", expectedRevision: "old-revision", operationId: "10000000-0000-4000-8000-000000000001", reason: "上次已核实的调整", draft: { ...props.boardSnapshot!.draft, waitingDuoIds: ["W", "U"], unmatchedIds: ["V"] } }
    sessionStorage.setItem("matching-board-save:board-session", JSON.stringify(pending))
    await render()
    expect(button("重新匹配").disabled).toBe(true)
    await click("核对上次保存")
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(pending)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it("shows published result details but offers no editing, pairing or save actions", async () => {
    await render({ session: { ...props.session, status: "confirmed" } })
    await openMember("A")
    expect(document.body.textContent).toContain("成员A & 成员B")
    expect(document.body.textContent).not.toContain("取消匹配")
    expect(document.body.textContent).not.toContain("移至未匹配池")
    expect(document.querySelector('input[type="checkbox"]')).toBeNull()
    expect([...document.querySelectorAll("button")].some((item) => item.textContent === "保存调整")).toBe(false)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.pair).not.toHaveBeenCalled()
  })

  it("allows member details on mobile while disabling desktop editing and save actions", async () => {
    desktop = false
    await render()
    await openMember("A")
    expect(document.body.textContent).toContain("成员A & 成员B")
    expect(document.body.textContent).not.toContain("取消匹配")
    expect(document.body.textContent).not.toContain("移至未匹配池")
    expect(document.querySelector('input[type="checkbox"]')).toBeNull()
    expect(button("重新匹配").disabled).toBe(true)
    expect(button("保存调整").disabled).toBe(true)
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="关闭个人资料"]')!.click())
    await setReason()
    expect(button("确认发布").disabled).toBe(true)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.publish).not.toHaveBeenCalled()
  })
})
