// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { BoardActionResult, BoardDisplayRow, BoardDraft, BoardRequest, BoardSnapshot } from "@/lib/matching/board-types"
import type { EnrichedMember } from "./match-detail-types"
import type { MatchSessionViewProps } from "./MatchSessionView"

const mocks = vi.hoisted(() => ({ group: vi.fn(), groupMove: vi.fn(), multi: vi.fn(), save: vi.fn(), load: vi.fn(), refresh: vi.fn(), publish: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock("@/app/admin/matching/[id]/board-actions", () => ({ inspectBoardGroup: mocks.group, inspectBoardGroupMove: mocks.groupMove, inspectBoardPair: vi.fn(), inspectBoardMultiMove: mocks.multi, rematchBoard: vi.fn(), saveBoard: mocks.save, loadMatchingBoard: mocks.load, setBoardMemberLock: vi.fn() }))
vi.mock("@/app/admin/matching/[id]/actions", () => ({ confirmSession: mocks.publish, unpublishSession: vi.fn(), lockPair: vi.fn(), unlockPair: vi.fn() }))
vi.mock("@/app/admin/matching/[id]/manual-actions", () => ({ recoverMatchingAdjustment: vi.fn() }))
import { MatchingBoardView } from "./MatchingBoardView"

const SLOT = "2026-11-01_下午"
const SLOT_TWO = "2026-11-02_上午"
const SLOT_THREE = "2026-11-03_晚上"
const poolIds = ["A", "B", "C", "D", "E", "F"]
const ids = [...poolIds, "U", "W"]
const name = (id: string) => `示例${id}`
const format = (slot: string) => slot.replace("_", " ")
const members: EnrichedMember[] = ids.map((id, i) => ({ id, record_source: null, member_identity: { full_name: name(id), nickname: null, gender: i % 2 ? "female" : "male", school_name: null, hobby_tags: [], nationality: "", degree_level: null, department: null }, member_interests: null, member_personality: null, member_boundaries: null }))
function resultRow(key: string, memberIds: string[], bestSlot = SLOT): BoardDisplayRow {
  return { key, resultId: key, status: "draft", member_a_id: memberIds[0], member_b_id: null, group_members: memberIds, total_score: 70, score_breakdown: null, rank: 1, best_slot: bestSlot, game_type: "多人" }
}
function fixture(): MatchSessionViewProps {
  const prefs = Object.fromEntries(ids.map((id) => [id, { availability: { "2026-11-01": ["下午"], ...(poolIds.slice(0, 3).includes(id) ? { "2026-11-02": ["上午"] } : {}), ...(poolIds.slice(3).includes(id) ? { "2026-11-03": ["晚上"] } : {}) } }]))
  const draft: BoardDraft = { duos: [], multi: { key: "original-pool", resultId: "original-pool", memberIds: [...poolIds], bestSlot: SLOT }, waitingDuoIds: ["W"], brokenPairs: [], unmatchedIds: ["U"] }
  const boardSnapshot: BoardSnapshot = { draft, rows: [resultRow("original-pool", poolIds)], revisionToken: "revision-current", lockedResultIds: [], lockedMemberIds: [], cohortMemberIds: ids, canViewRaw: true, currentSubmissionPrefs: prefs }
  return { session: { id: "grouping-session", session_name: "多人分组", status: "draft", results_ready: true, total_candidates: ids.length, total_matched: 6, total_unmatched: 2, round_id: "round", publication_version: 2 }, results: [], diagnostics: [], candidates: [], boardSnapshot, boardMembers: members, canViewRawSubmissions: true }
}
let root: Root
let props: MatchSessionViewProps
let desktop: boolean
function button(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.getAttribute("aria-label") === label || item.textContent?.trim() === label)
  if (!found) throw new Error(`Button not found: ${label}`)
  return found
}
async function click(label: string) { await act(async () => button(label).click()) }
function candidate(slot = SLOT) { return document.querySelector<HTMLElement>(`[data-board-time-slot="${slot}"]`)! }
function group(key = "new-group") { return document.querySelector<HTMLElement>(`[data-board-group-key="${key}"]`)! }
function upper() { return document.querySelector<HTMLElement>("[data-board-multi-waiting]")! }
function chips(container: Element) { return [...container.querySelectorAll<HTMLElement>("[data-member-id]")].map((item) => item.dataset.memberId) }
async function setReason() {
  const input = document.getElementById("board-audit-reason") as HTMLInputElement
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "确认成员时间并调整分组"); input.dispatchEvent(new Event("input", { bubbles: true })) })
}
async function render(overrides: Partial<MatchSessionViewProps> = {}) {
  props = { ...props, ...overrides }
  await act(async () => root.render(createElement(MatchingBoardView, props)))
}
function groupDraft(draft: BoardDraft, selectedIds: string[], slot = SLOT): BoardDraft {
  const remaining = draft.multi!.memberIds.filter((id) => !selectedIds.includes(id))
  return { ...draft, multiMode: "grouped", multi: remaining.length ? { key: "waiting", memberIds: remaining, bestSlot: draft.multi!.bestSlot } : null, multiGroups: [...(draft.multiGroups ?? []), { key: "new-group", memberIds: selectedIds, bestSlot: slot }] }
}
function displayRows(draft: BoardDraft) {
  return (draft.multiMode === "grouped" ? draft.multiGroups ?? [] : draft.multi ? [draft.multi] : []).map((entry) => resultRow(entry.key, entry.memberIds, entry.bestSlot!))
}
function useGroupedFixture(waiting = ["D", "E", "F"]) {
  const draft = groupDraft(props.boardSnapshot!.draft, ["A", "B", "C"])
  draft.multi = waiting.length ? { key: "waiting", memberIds: waiting, bestSlot: SLOT } : null
  if (!waiting.length) draft.multiGroups![0].memberIds.push("D", "E", "F")
  props.boardSnapshot = { ...props.boardSnapshot!, draft, rows: displayRows(draft) }
}
async function drag(source: Element, target: Element) {
  vi.useFakeTimers()
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => target) })
  const pointerEvent = (type: string) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: 10, clientY: 10 })
    Object.defineProperty(event, "pointerId", { value: 1 })
    return event
  }
  await act(async () => source.dispatchEvent(pointerEvent("pointerdown")))
  await act(async () => vi.advanceTimersByTime(349))
  expect(mocks.groupMove).not.toHaveBeenCalled()
  await act(async () => vi.advanceTimersByTime(1))
  await act(async () => source.dispatchEvent(pointerEvent("pointerup")))
  await act(async () => vi.advanceTimersByTime(0))
  vi.useRealTimers()
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
  mocks.group.mockImplementation(async ({ draft, memberIds, slot }: BoardRequest & { memberIds: string[]; slot: string }): Promise<BoardActionResult> => {
    const next = groupDraft(draft, memberIds, slot)
    return { passed: true, draft: next, rows: displayRows(next) }
  })
  mocks.groupMove.mockImplementation(async ({ draft, memberId, groupKey }: BoardRequest & { memberId: string; groupKey: string }): Promise<BoardActionResult> => {
    const next = structuredClone(draft)
    const remaining = (next.multi?.memberIds ?? []).filter((id) => id !== memberId)
    next.multi = remaining.length ? { ...next.multi!, memberIds: remaining } : null
    next.multiGroups = next.multiGroups!.map((entry) => entry.key === groupKey ? { ...entry, memberIds: [...entry.memberIds, memberId] } : { ...entry, memberIds: entry.memberIds.filter((id) => id !== memberId) })
    return { passed: true, draft: next, rows: displayRows(next) }
  })
  mocks.multi.mockImplementation(async ({ draft, memberId }: BoardRequest & { memberId: string }): Promise<BoardActionResult> => {
    const next = structuredClone(draft)
    next.multi = { key: "waiting", memberIds: [...(next.multi?.memberIds ?? []), memberId], bestSlot: SLOT }
    next.multiGroups = next.multiGroups?.map((entry) => ({ ...entry, memberIds: entry.memberIds.filter((id) => id !== memberId) })).filter((entry) => entry.memberIds.length)
    return { passed: true, draft: next, rows: displayRows(next) }
  })
  mocks.save.mockResolvedValue({ success: true })
  mocks.load.mockImplementation(async (): Promise<BoardSnapshot> => {
    const draft = structuredClone(mocks.save.mock.calls.at(-1)?.[0].draft ?? props.boardSnapshot!.draft) as BoardDraft
    return { ...props.boardSnapshot!, draft, rows: displayRows(draft), revisionToken: "after-save" }
  })
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear()
})

describe("multiplayer time grouping board", () => {
  it("shows all eligible candidates in repeated time rows but opens only the clicked name's popover", async () => {
    await render()
    expect(chips(upper())).toEqual(poolIds)
    expect(chips(candidate())).toEqual(poolIds)
    expect(chips(candidate(SLOT_TWO))).toEqual(["A", "B", "C"])
    expect(chips(candidate(SLOT_THREE))).toEqual(["D", "E", "F"])
    await act(async () => candidate(SLOT_TWO).querySelector<HTMLButtonElement>('[data-member-id="A"]')!.click())
    expect(document.querySelectorAll('[data-slot="popover-content"]')).toHaveLength(1)
    expect(document.querySelector('[data-slot="popover-content"]')?.textContent).toContain(name("A"))
    expect(document.querySelectorAll('[data-member-id="A"][aria-expanded="true"]')).toHaveLength(1)
    expect(mocks.group).not.toHaveBeenCalled()
  })

  it("confirms only selected candidates, assigns each person once, and undoes the whole grouping", async () => {
    await render()
    for (const id of ["D", "E", "F"]) {
      const checkbox = candidate().querySelector<HTMLInputElement>(`input[aria-label="将 ${name(id)}加入${format(SLOT)}小组"]`)!
      expect(checkbox.checked).toBe(true)
      await act(async () => checkbox.click())
    }
    await click(`确认 ${format(SLOT)}分组`)
    expect(mocks.group).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ memberIds: ["A", "B", "C"], slot: SLOT, expectedRevision: "revision-current" }))
    expect(chips(group())).toEqual(["A", "B", "C"])
    expect(chips(upper())).toEqual(["D", "E", "F"])
    expect(candidate(SLOT_TWO)).toBeNull()
    expect(chips(candidate())).toEqual(["D", "E", "F"])
    expect(mocks.save).not.toHaveBeenCalled()
    await click("撤销")
    expect(group()).toBeNull()
    expect(chips(upper())).toEqual(poolIds)
    expect(chips(candidate(SLOT_TWO))).toEqual(["A", "B", "C"])
  })

  it("requires at least three checked people before confirming a candidate row", async () => {
    await render()
    const checkbox = candidate(SLOT_TWO).querySelector<HTMLInputElement>(`input[aria-label="将 ${name("C")}加入${format(SLOT_TWO)}小组"]`)!
    await act(async () => checkbox.click())
    expect(button(`确认 ${format(SLOT_TWO)}分组`).disabled).toBe(true)
    await click(`确认 ${format(SLOT_TWO)}分组`)
    expect(mocks.group).not.toHaveBeenCalled()
  })

  it("saves a grouped draft with people still waiting, but requires resolving the waiting pool before publication", async () => {
    await render()
    await click(`确认 ${format(SLOT_TWO)}分组`)
    await setReason()
    expect(button("保存调整").disabled).toBe(false)
    await click("保存调整")
    expect(mocks.save).toHaveBeenCalledOnce()
    expect(mocks.save.mock.calls[0][0].draft.multiMode).toBe("grouped")
    expect(mocks.save.mock.calls[0][0].draft.multi.memberIds).toEqual(["D", "E", "F"])
    expect(button("确认发布").disabled).toBe(true)
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it("allows publication after all multiplayer participants belong to valid saved groups", async () => {
    useGroupedFixture([])
    await render(); await setReason()
    expect(button("确认发布").disabled).toBe(false)
  })

  it("long-presses a pool member and targets an existing formal group", async () => {
    useGroupedFixture()
    await render()
    await drag(upper().querySelector('[data-member-id="D"]')!, group())
    expect(mocks.groupMove).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ memberId: "D", groupKey: "new-group" }))
    expect(chips(group())).toEqual(["A", "B", "C", "D"])
    expect(chips(upper())).toEqual(["E", "F"])
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("checks a drag back to the waiting pool and prevents saving a remaining two-person formal group", async () => {
    useGroupedFixture()
    await render()
    await drag(group().querySelector('[data-member-id="C"]')!, upper())
    expect(mocks.multi).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ memberId: "C" }))
    expect(chips(group())).toEqual(["A", "B"])
    expect(chips(upper())).toEqual(["D", "E", "F", "C"])
    await setReason()
    expect(button("保存调整").disabled).toBe(true)
  })

  it("keeps a pinned waiting-duo member out of formal multiplayer groups", async () => {
    useGroupedFixture()
    props.boardSnapshot!.lockedMemberIds = ["W"]
    await render()
    await drag(document.querySelector('[data-board-drop-pool="duo"] [data-member-id="W"]')!, group())
    expect(mocks.groupMove).not.toHaveBeenCalled()
    expect(chips(group())).toEqual(["A", "B", "C"])
    expect(document.body.textContent).toContain("锁定")
  })

  it("does not reveal raw candidate times to administrators without submission access", async () => {
    useGroupedFixture()
    props.boardSnapshot!.canViewRaw = false
    delete props.boardSnapshot!.currentSubmissionPrefs
    await render({ canViewRawSubmissions: false, submissionPrefs: {} })
    expect(document.querySelector('[data-board-time-slot]')).toBeNull()
    expect(group()).not.toBeNull()
    expect(document.body.textContent).not.toContain(format(SLOT_THREE))
  })

  it("shows no candidate rows for an empty pool", async () => {
    props.boardSnapshot!.draft.multi = null
    props.boardSnapshot!.draft.unmatchedIds.push(...poolIds)
    props.boardSnapshot!.rows = []
    await render()
    expect(document.querySelector('[data-board-time-slot]')).toBeNull()
  })

  it("moves a person between formal groups without duplicating their assignment", async () => {
    useGroupedFixture([])
    props.boardSnapshot!.draft.multiGroups = [
      { key: "new-group", memberIds: ["A", "B", "C"], bestSlot: SLOT },
      { key: "second-group", memberIds: ["D", "E", "F"], bestSlot: SLOT },
    ]
    props.boardSnapshot!.rows = displayRows(props.boardSnapshot!.draft)
    await render()
    await drag(group().querySelector('[data-member-id="C"]')!, group("second-group"))
    expect(mocks.groupMove).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ memberId: "C", groupKey: "second-group" }))
    expect(chips(group())).toEqual(["A", "B"])
    expect(chips(group("second-group"))).toEqual(["D", "E", "F", "C"])
    expect(document.querySelectorAll('[data-board-group-key] [data-member-id="C"]')).toHaveLength(1)
    await setReason()
    expect(button("保存调整").disabled).toBe(true)
    await click("撤销")
    expect(chips(group())).toEqual(["A", "B", "C"])
    expect(chips(group("second-group"))).toEqual(["D", "E", "F"])
  })

  it("preserves the current grouping if server compatibility checking rejects a move", async () => {
    useGroupedFixture()
    mocks.groupMove.mockResolvedValueOnce({ error: "所选成员没有该小组的共同时间", passed: false })
    await render()
    await drag(upper().querySelector('[data-member-id="D"]')!, group())
    expect(chips(group())).toEqual(["A", "B", "C"])
    expect(chips(upper())).toEqual(["D", "E", "F"])
    expect(document.body.textContent).toContain("所选成员没有该小组的共同时间")
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("does not fabricate suggestions when no period covers at least three pool members", async () => {
    props.boardSnapshot!.currentSubmissionPrefs = Object.fromEntries(poolIds.map((id, i) => [id, { availability: { [`2026-11-${String(i + 1).padStart(2, "0")}`]: ["下午"] } }]))
    await render()
    expect(document.querySelector('[data-board-time-slot]')).toBeNull()
    expect(chips(upper())).toEqual(poolIds)
    expect(mocks.group).not.toHaveBeenCalled()
  })

  it("preserves confirmed groups as read-only on a published board", async () => {
    useGroupedFixture([])
    await render({ session: { ...props.session, status: "confirmed" } })
    expect(chips(group())).toEqual(poolIds)
    expect(document.querySelector('input[data-candidate-member]')).toBeNull()
    expect([...document.querySelectorAll("button")].some((item) => item.getAttribute("aria-label")?.startsWith("确认 "))).toBe(false)
    await act(async () => group().querySelector<HTMLButtonElement>('[data-member-id="A"]')!.click())
    expect(document.querySelectorAll('[data-slot="popover-content"]')).toHaveLength(1)
    expect(mocks.group).not.toHaveBeenCalled()
  })
})
