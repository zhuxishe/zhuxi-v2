// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { BoardActionResult, BoardDisplayRow, BoardDraft, BoardRequest, BoardSnapshot } from "@/lib/matching/board-types"
import type { EnrichedMember } from "./match-detail-types"
import type { MatchSessionViewProps } from "./MatchSessionView"
import { buildSavedMatchingReview } from "@/lib/matching/session-review"
import { MatchingReviewDownloadError } from "./matching-review-download"

const mocks = vi.hoisted(() => ({ group: vi.fn(), groupMove: vi.fn(), dissolve: vi.fn(), groupTime: vi.fn(), multi: vi.fn(), save: vi.fn(), load: vi.fn(), refresh: vi.fn(), publish: vi.fn(), recommend: vi.fn(), inspectSuggestion: vi.fn(), download: vi.fn() }))
vi.mock("./matching-review-download", async (original) => ({ ...await original<typeof import("./matching-review-download")>(), downloadMatchingReview: mocks.download }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock("@/app/admin/matching/[id]/board-actions", () => ({ recommendBoardSmallGroups: mocks.recommend, inspectBoardSmallGroupCandidates: mocks.inspectSuggestion, inspectBoardGroup: mocks.group, inspectBoardGroupMove: mocks.groupMove, inspectBoardGroupDissolve: mocks.dissolve, inspectBoardGroupTime: mocks.groupTime, inspectBoardPair: vi.fn(), inspectBoardMultiMove: mocks.multi, rematchBoard: vi.fn(), saveBoard: mocks.save, loadMatchingBoard: mocks.load, setBoardMemberLock: vi.fn() }))
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
function reviewed(snapshot: BoardSnapshot): BoardSnapshot {
  const draft = snapshot.draft
  const layout = { waitingDuoIds: draft.waitingDuoIds, brokenPairs: draft.brokenPairs, unmatchedMessage: draft.unmatchedMessage,
    ...(draft.multiMode === "grouped" ? { multiMode: "grouped" as const, waitingMultiIds: draft.multi?.memberIds ?? [], multiPoolSlot: draft.multi?.bestSlot ?? null,
      smallGroupMemberIds: (draft.multiGroups ?? []).filter((group) => group.groupKind === "small").map((group) => group.memberIds),
      manualSmallGroupMemberIds: (draft.multiGroups ?? []).filter((group) => group.groupKind === "small" && group.manuallyAdjusted).map((group) => group.memberIds) } : {}) }
  return { ...snapshot, savedReview: buildSavedMatchingReview("grouping-session", {
    base_revision: snapshot.revisionToken, session_status: "draft", cohort_member_ids: snapshot.cohortMemberIds, layout,
    unmatched_message_recipient_ids: [...draft.waitingDuoIds, ...draft.unmatchedIds],
    results: snapshot.rows.map((row) => ({ ...row, id: row.resultId ?? row.key, status: row.status ?? "draft" })),
    capture: { captured_at: "2026-11-02T01:00:00Z", source: { submissions: Object.entries(snapshot.currentSubmissionPrefs ?? {}).map(([member_id, pref]) => ({ ...pref, member_id, member: members.find((member) => member.id === member_id) })) } },
  }, snapshot.canViewRaw) }
}
function fixture(): MatchSessionViewProps {
  const prefs = Object.fromEntries(ids.map((id) => [id, { availability: { "2026-11-01": ["下午"], ...(poolIds.slice(0, 3).includes(id) ? { "2026-11-02": ["上午"] } : {}), ...(poolIds.slice(3).includes(id) ? { "2026-11-03": ["晚上"] } : {}) } }]))
  const draft: BoardDraft = { duos: [], multi: { key: "original-pool", resultId: "original-pool", memberIds: [...poolIds], bestSlot: SLOT }, waitingDuoIds: ["W"], brokenPairs: [], unmatchedIds: ["U"] }
  const boardSnapshot: BoardSnapshot = { draft, rows: [resultRow("original-pool", poolIds)], revisionToken: "revision-current", lockedResultIds: [], lockedMemberIds: [], cohortMemberIds: ids, canViewRaw: true, currentSubmissionPrefs: prefs }
  return { session: { id: "grouping-session", session_name: "多人分组", status: "draft", results_ready: true, total_candidates: ids.length, total_matched: 6, total_unmatched: 2, round_id: "round", publication_version: 2 }, results: [], diagnostics: [], candidates: [], boardSnapshot: reviewed(boardSnapshot), boardMembers: members, canViewRawSubmissions: true }
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
  if (overrides.session && props.boardSnapshot?.savedReview) {
    props.boardSnapshot.savedReview.sessionStatus = overrides.session.status
    props.boardSnapshot.savedReview.publicationVersion = overrides.session.publication_version ?? null
  }
  await act(async () => root.render(createElement(MatchingBoardView, props)))
}
function groupDraft(draft: BoardDraft, selectedIds: string[], slot = SLOT): BoardDraft {
  const remaining = draft.multi!.memberIds.filter((id) => !selectedIds.includes(id))
  return { ...draft, unmatchedIds: draft.unmatchedIds.filter((id) => !selectedIds.includes(id)), multiMode: "grouped", multi: remaining.length ? { key: "waiting", memberIds: remaining, bestSlot: draft.multi!.bestSlot } : null, multiGroups: [...(draft.multiGroups ?? []), { key: "new-group", memberIds: selectedIds, bestSlot: slot }] }
}
function displayRows(draft: BoardDraft) {
  return (draft.multiMode === "grouped" ? draft.multiGroups ?? [] : draft.multi ? [draft.multi] : []).map((entry) => resultRow(entry.key, entry.memberIds, entry.bestSlot!))
}
function useGroupedFixture(waiting = ["D", "E", "F"]) {
  const draft = groupDraft(props.boardSnapshot!.draft, ["A", "B", "C"])
  draft.multi = waiting.length ? { key: "waiting", memberIds: waiting, bestSlot: SLOT } : null
  if (!waiting.length) draft.multiGroups![0].memberIds.push("D", "E", "F")
  props.boardSnapshot = reviewed({ ...props.boardSnapshot!, draft, rows: displayRows(draft) })
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
  mocks.recommend.mockResolvedValue({ success: true, recommendations: [], revisionToken: "revision-current" })
  mocks.inspectSuggestion.mockResolvedValue({ success: true, passed: true })
  mocks.group.mockImplementation(async ({ draft, memberIds, slot, groupKind, manuallyAdjusted }: BoardRequest & { memberIds: string[]; slot: string; groupKind?: "small"; manuallyAdjusted?: boolean }): Promise<BoardActionResult> => {
    const next = groupDraft(draft, memberIds, slot)
    if (groupKind) next.multiGroups![next.multiGroups!.length - 1].groupKind = groupKind
    if (manuallyAdjusted && groupKind) next.multiGroups![next.multiGroups!.length - 1].manuallyAdjusted = true
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
    next.multiGroups = next.multiGroups?.map((entry) => ({ ...entry, ...(entry.groupKind === "small" && entry.memberIds.includes(memberId) ? { manuallyAdjusted: true as const } : {}), memberIds: entry.memberIds.filter((id) => id !== memberId) })).filter((entry) => entry.memberIds.length)
    return { passed: true, draft: next, rows: displayRows(next) }
  })
  mocks.dissolve.mockImplementation(async ({ draft, groupKey }: BoardRequest & { groupKey: string }): Promise<BoardActionResult> => {
    const next = structuredClone(draft), found = next.multiGroups!.find((entry) => entry.key === groupKey)!
    next.multiGroups = next.multiGroups!.filter((entry) => entry.key !== groupKey)
    next.multi = { key: "waiting", memberIds: [...(next.multi?.memberIds ?? []), ...found.memberIds], bestSlot: null }
    return { passed: true, draft: next, rows: displayRows(next) }
  })
  mocks.groupTime.mockImplementation(async ({ draft, groupKey, slot }: BoardRequest & { groupKey: string; slot: string }): Promise<BoardActionResult> => {
    const next = structuredClone(draft)
    next.multiGroups = next.multiGroups!.map((entry) => entry.key === groupKey ? { ...entry, bestSlot: slot } : entry)
    return { passed: true, draft: next, rows: displayRows(next) }
  })
  mocks.save.mockResolvedValue({ success: true })
  mocks.publish.mockResolvedValue({ success: true })
  mocks.download.mockResolvedValue(undefined)
  mocks.load.mockImplementation(async (): Promise<BoardSnapshot> => {
    const draft = structuredClone(mocks.save.mock.calls.at(-1)?.[0].draft ?? props.boardSnapshot!.draft) as BoardDraft
    return reviewed({ ...props.boardSnapshot!, draft, rows: displayRows(draft), revisionToken: "after-save" })
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

describe("small-group suggestions integrated with the board", () => {
  function suggest() {
    mocks.recommend.mockResolvedValue({ success: true, recommendations: [{ key: "suggestion", memberIds: [...poolIds], bestSlot: SLOT, commonSlots: [SLOT] }], revisionToken: "revision-current" })
  }
  const suggestion = () => document.querySelector<HTMLElement>('[data-board-small-key="suggestion"]')!
  const middle = () => document.querySelector<HTMLElement>('[aria-label="4–6人分组"]')!

  it("loads suggestions once between the unchanged upper pool and time groups", async () => {
    suggest(); await render()
    expect(mocks.recommend).toHaveBeenCalledOnce()
    expect(chips(upper())).toEqual(poolIds)
    expect(chips(suggestion())).toEqual(poolIds)
    expect(chips(candidate())).toEqual(poolIds)
    expect(document.body.textContent).not.toContain("尚未保存")
    const headings = [...document.querySelectorAll('[aria-label="多人本池子"] h3')].map((heading) => heading.textContent)
    expect(headings).toEqual(["多人候选池", "4–6人分组", "按时间分组"])
    await setReason()
    expect(mocks.recommend).toHaveBeenCalledOnce()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("confirms a unique small group in the middle and saves its kind", async () => {
    suggest(); await render()
    await click("确认第 1 个4–6人建议组")
    expect(mocks.group).toHaveBeenCalledWith(expect.objectContaining({ groupKind: "small", memberIds: poolIds, slot: SLOT }))
    expect(middle().querySelector('[data-board-group-key="new-group"]')).not.toBeNull()
    expect(suggestion()).toBeNull()
    expect(chips(upper())).toEqual([])
    expect(candidate()).toBeNull()
    await setReason(); await click("保存调整")
    expect(mocks.save.mock.calls[0][0].draft.multiGroups[0].groupKind).toBe("small")
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it("allows a manually edited three-person suggestion, and checks further drags before confirmation", async () => {
    suggest(); await render()
    for (const id of ["D", "E", "F"]) await click(`将 ${name(id)}移出建议 1`)
    expect(chips(suggestion())).toEqual(["A", "B", "C"])
    expect(button("确认第 1 个4–6人建议组").disabled).toBe(false)
    expect(chips(upper())).toEqual(poolIds)
    await drag(upper().querySelector('[data-member-id="D"]')!, suggestion())
    expect(mocks.inspectSuggestion).toHaveBeenCalledWith(expect.objectContaining({ memberIds: ["A", "B", "C", "D"], slot: SLOT }))
    expect(chips(suggestion())).toEqual(["A", "B", "C", "D"])
    expect(button("确认第 1 个4–6人建议组").disabled).toBe(false)
    expect(mocks.recommend).toHaveBeenCalledOnce()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("keeps the previous suggestion when a candidate fails server compatibility", async () => {
    suggest(); await render()
    await click(`将 ${name("F")}移出建议 1`)
    mocks.inspectSuggestion.mockResolvedValue({ passed: false, reasons: ["当前不满足匹配条件"] })
    await drag(upper().querySelector('[data-member-id="F"]')!, suggestion())
    expect(chips(suggestion())).toEqual(["A", "B", "C", "D", "E"])
    expect(document.body.textContent).toContain("当前不满足匹配条件")
  })

  it("prunes members confirmed in the time section without reshuffling the remaining suggestion", async () => {
    suggest(); await render()
    await click(`确认 ${format(SLOT_TWO)}分组`)
    expect(chips(suggestion())).toEqual(["D", "E", "F"])
    expect(middle().querySelector('[data-board-group-key="new-group"]')).toBeNull()
    expect(mocks.recommend).toHaveBeenCalledOnce()
    await click("撤销")
    expect(chips(suggestion())).toEqual(poolIds)
  })

  it("allows saving an explicitly adjusted three-person small group with a size warning", async () => {
    const draft = groupDraft(props.boardSnapshot!.draft, ["A", "B", "C", "D"])
    draft.multiGroups![0].groupKind = "small"
    props.boardSnapshot = { ...props.boardSnapshot!, draft, rows: displayRows(draft) }
    await render()
    await drag(group().querySelector('[data-member-id="D"]')!, upper())
    expect(chips(group())).toEqual(["A", "B", "C"])
    expect(middle().textContent).toContain("已人工调整，可保存")
    await setReason()
    expect(button("保存调整").disabled).toBe(false)
    expect(button("确认发布").disabled).toBe(true)
  })

  it("recommends on mobile for viewing without exposing edit controls", async () => {
    desktop = false; suggest(); await render()
    expect(chips(suggestion())).toEqual(poolIds)
    expect(button("确认第 1 个4–6人建议组").disabled).toBe(true)
    expect(button("重新推荐").disabled).toBe(true)
  })
})

describe("manual creation and explicit group controls", () => {
  it("offers a manual creator in both sections and creates a seven-person small group without saving or publishing", async () => {
    await render()
    const middle = document.querySelector('[aria-label="4–6人分组"]')!
    const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")].filter((item) => item.textContent?.trim() === "手动新增小组")
    expect(buttons).toHaveLength(2)
    await act(async () => [...middle.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === "手动新增小组")!.click())
    for (const id of [...poolIds, "U"]) await act(async () => document.querySelector<HTMLInputElement>(`[aria-label="手动分组选择 ${name(id)}"]`)!.click())
    expect(document.body.textContent).toContain("当前 7 人，超出系统推荐")
    await click("确认新小组")
    expect(mocks.group).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ memberIds: [...poolIds, "U"], groupKind: "small", manuallyAdjusted: true, slot: SLOT }))
    expect(chips(group())).toEqual([...poolIds, "U"])
    expect(document.activeElement).toBe(group())
    expect(document.querySelector('[aria-label="4–6人分组"]')!.textContent).toContain("已人工调整，可保存")
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled()
  })

  it("creates an ordinary manual group through the time section", async () => {
    await render()
    const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")].filter((item) => item.textContent?.trim() === "手动新增小组")
    await act(async () => buttons[1].click())
    for (const id of ["A", "B", "U"]) await act(async () => document.querySelector<HTMLInputElement>(`[aria-label="手动分组选择 ${name(id)}"]`)!.click())
    await click("确认新小组")
    expect(mocks.group).toHaveBeenCalledWith(expect.objectContaining({ memberIds: ["A", "B", "U"], manuallyAdjusted: true }))
    expect(mocks.group.mock.calls[0][0].groupKind).toBeUndefined()
    expect(group().closest('[aria-label="4–6人分组"]')).toBeNull()
  })

  it("explains dissolution, returns members to waiting, and supports undo", async () => {
    useGroupedFixture(); await render()
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true)
    await click("解散第 1 个多人小组")
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("成员将退回多人待分组区"))
    expect(mocks.dissolve).toHaveBeenCalledWith(expect.objectContaining({ groupKey: "new-group" }))
    expect(group()).toBeNull()
    expect(chips(upper()).sort()).toEqual([...poolIds].sort())
    expect(document.body.textContent).not.toContain("原安排已不在当前全员共同时间")
    await click("撤销")
    expect(chips(group())).toEqual(["A", "B", "C"])
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled()
  })

  it("uses the server to change a formal group's recommendation", async () => {
    useGroupedFixture(); await render()
    const time = document.querySelector<HTMLSelectElement>('[aria-label="修改第 1 个多人小组的推荐时间"]')!
    expect([...time.options].map((option) => option.value)).toEqual([SLOT, SLOT_TWO])
    await act(async () => { time.value = SLOT_TWO; time.dispatchEvent(new Event("change", { bubbles: true })) })
    expect(mocks.groupTime).toHaveBeenCalledWith(expect.objectContaining({ groupKey: "new-group", slot: SLOT_TWO }))
    expect(group().textContent).toContain(format(SLOT_TWO))
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled()
  })
})

describe("saved publication review below the board", () => {
  const review = () => document.querySelector<HTMLElement>('[aria-label="发布前结果确认"]')!
  async function enterMessage(value: string) {
    const input = document.getElementById("board-unmatched-message") as HTMLTextAreaElement
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })) })
  }
  it("keeps public message edits local, invalidates the saved review, and lets one undo restore the previous message", async () => {
    await render()
    expect(document.body.textContent).toContain("当前待核对：2 人（含 1 人等待双人搭档）")
    await enterMessage("工作人员会继续协调。")
    await enterMessage("工作人员会继续协调。\n请留意站内通知。")
    expect(review().textContent).toContain("未保存调整")
    expect(button("导出 Excel").disabled).toBe(true)
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled()
    await click("撤销")
    expect((document.getElementById("board-unmatched-message") as HTMLTextAreaElement).value).toBe("")
    expect(review().querySelector("table")).not.toBeNull()
  })
  it("saves a message with the draft and shows the same text and recipients in the fresh review", async () => {
    await render(); await enterMessage("后续请留意通知。\n谢谢参与。")
    await setReason(); await click("保存调整")
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ draft: expect.objectContaining({ unmatchedMessage: "后续请留意通知。\n谢谢参与。" }) }))
    expect(review().textContent).toContain("后续请留意通知。")
    expect(review().textContent).toContain("本次可接收 · 2 人")
    expect(mocks.publish).not.toHaveBeenCalled()
  })
  it("counts Unicode characters and blocks an oversized message without truncating the player's intended text", async () => {
    await render(); await setReason()
    await enterMessage("🌿".repeat(300))
    expect(button("保存调整").disabled).toBe(false)
    await enterMessage("字".repeat(301))
    expect(document.body.textContent).toContain("工作人员留言最多300字")
    expect(button("保存调整").disabled).toBe(true)
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled()
  })
  it("shows the saved group rather than unconfirmed recommendations, and exports the reviewed version", async () => {
    mocks.recommend.mockResolvedValue({ success: true, recommendations: [{ key: "suggestion", memberIds: poolIds.slice(0, 4), bestSlot: SLOT, commonSlots: [SLOT] }] })
    await render()
    expect(review().querySelectorAll("tbody tr[data-review-result]")).toHaveLength(1)
    expect(review().textContent).toContain("6 人")
    expect(review().textContent).toContain("待双人搭档")
    expect(review().textContent).toContain(name("W"))
    await click("导出 Excel")
    expect(mocks.download).toHaveBeenCalledWith("grouping-session", "revision-current", props.boardSnapshot!.savedReview!.publicationSignature)
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled()
  })
  it("hides old review rows and prevents export until all edits are saved", async () => {
    await render()
    await click(`确认 ${format(SLOT_TWO)}分组`)
    expect(review().textContent).toContain("未保存调整")
    expect(review().querySelector("table")).toBeNull()
    expect(button("导出 Excel").disabled).toBe(true)
    expect(button("导出已核对结果").disabled).toBe(true)
    expect(button("重新核对").disabled).toBe(true)
    await setReason(); await click("保存调整")
    expect(review().querySelectorAll("tbody tr[data-review-result]")).toHaveLength(1)
    expect(review().textContent).toContain("3 人")
    expect(review().textContent).toContain("待多人分组")
    expect(button("导出 Excel").disabled).toBe(false)
    await click("导出已核对结果")
    expect(mocks.download).toHaveBeenCalledWith("grouping-session", "after-save", expect.any(String))
  })
  it("invalidates stale export and lets a read-only refresh restore the review without saving", async () => {
    await render()
    mocks.download.mockRejectedValue(new MatchingReviewDownloadError("方案已变化，请重新核对", true))
    await click("导出 Excel")
    expect(review().querySelector("table")).toBeNull()
    expect(button("导出 Excel").disabled).toBe(true)
    expect(button("重新核对").disabled).toBe(false)
    await click("重新核对")
    expect(review().querySelector("table")).not.toBeNull()
    expect(mocks.load).toHaveBeenCalledOnce()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it("passes both the reviewed content and saved revision into publication", async () => {
    useGroupedFixture([])
    await render(); await setReason(); await click("确认发布")
    expect(mocks.publish).toHaveBeenCalledWith("grouping-session", expect.any(String), 2,
      props.boardSnapshot!.savedReview!.publicationSignature, "revision-current")
  })
  it("fails closed if a complete saved review is unavailable", async () => {
    props.boardSnapshot!.savedReview = null
    await render(); await setReason()
    expect(review().textContent).toContain("暂时无法读取")
    expect(button("导出 Excel").disabled).toBe(true)
    expect(button("确认发布").disabled).toBe(true)
  })
  it("reads the successful publication state into the table before props are refreshed", async () => {
    useGroupedFixture([])
    const fresh = reviewed({ ...props.boardSnapshot!, revisionToken: "published-revision" })
    fresh.savedReview!.sessionStatus = "confirmed"; fresh.savedReview!.publicationVersion = 3
    mocks.load.mockResolvedValue(fresh)
    await render(); await setReason(); await click("确认发布")
    expect(review().textContent).toContain("已发布 · 第 3 版")
    expect([...document.querySelectorAll("button")].some((item) => item.textContent === "确认发布")).toBe(false)
    expect(button("撤回发布")).toBeDefined()
    expect(mocks.refresh).toHaveBeenCalled()
    await click("导出 Excel")
    expect(mocks.download).toHaveBeenCalledWith("grouping-session", "published-revision", fresh.savedReview!.publicationSignature)
  })
  it.each(["unknown", "transport", "reload"])("hides the old plan after %s publication outcome until a read-only refresh", async (kind) => {
    useGroupedFixture([])
    if (kind === "unknown") mocks.publish.mockResolvedValue({ error: "发布结果待核对", unknown: true })
    if (kind === "transport") mocks.publish.mockRejectedValue(new Error("lost action response"))
    if (kind === "reload") mocks.load.mockRejectedValueOnce(new Error("saved but read failed"))
    await render(); await setReason(); await click("确认发布")
    expect(review().querySelector("table")).toBeNull()
    expect(button("导出 Excel").disabled).toBe(true)
    expect(button("确认发布").disabled).toBe(true)
    expect(button("重新核对").disabled).toBe(false)
    await click("重新核对")
    expect(review().querySelector("table")).not.toBeNull()
    expect(mocks.publish).toHaveBeenCalledOnce()
  })
  it("updates actions when a read-only refresh discovers another administrator already published", async () => {
    useGroupedFixture([])
    const fresh = reviewed({ ...props.boardSnapshot!, revisionToken: "other-admin-version" })
    fresh.savedReview!.sessionStatus = "confirmed"; fresh.savedReview!.publicationVersion = 3
    mocks.load.mockResolvedValue(fresh)
    await render(); await click("重新核对")
    expect(review().textContent).toContain("已发布 · 第 3 版")
    expect(button("撤回发布")).toBeDefined()
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it("uses the session version when draft result rows have been reset to zero after withdrawal", async () => {
    useGroupedFixture([])
    props.boardSnapshot!.savedReview!.publicationVersion = 0
    props.session.publication_version = 2
    await render(); await setReason(); await click("确认发布")
    expect(mocks.publish).toHaveBeenCalledWith("grouping-session", expect.any(String), 2, expect.any(String), "revision-current")
  })
})
