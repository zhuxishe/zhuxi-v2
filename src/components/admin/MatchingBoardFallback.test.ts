// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { EnrichedMatchResult, EnrichedMember } from "./match-detail-types"
import type { MatchSessionViewProps } from "./MatchSessionView"

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock("@/app/admin/matching/[id]/board-actions", () => ({ recommendBoardSmallGroups: vi.fn(async () => ({ success: true, recommendations: [] })), inspectBoardSmallGroupCandidates: vi.fn(async () => ({ success: true, passed: true })), inspectBoardGroup: mocks.mutate, inspectBoardGroupMove: mocks.mutate, inspectBoardPair: mocks.mutate, inspectBoardMultiMove: mocks.mutate, rematchBoard: mocks.mutate, saveBoard: mocks.mutate, loadMatchingBoard: vi.fn(), setBoardMemberLock: mocks.mutate }))
vi.mock("@/app/admin/matching/[id]/actions", () => ({ confirmSession: mocks.mutate, unpublishSession: mocks.mutate, lockPair: mocks.mutate, unlockPair: mocks.mutate }))
vi.mock("@/app/admin/matching/[id]/manual-actions", () => ({ recoverMatchingAdjustment: mocks.mutate }))
import { fallbackBoard, MatchingBoardView } from "./MatchingBoardView"

const member = (id: string): EnrichedMember => ({ id, record_source: null, member_identity: { full_name: `成员${id}`, nickname: null, gender: "female", school_name: null, hobby_tags: [], nationality: "", degree_level: null, department: null }, member_interests: null, member_personality: null, member_boundaries: null })
function result(id: string, ids: string[], status = "confirmed"): EnrichedMatchResult {
  return { id, total_score: 70, best_slot: "2026-11-01_下午", rank: 1, status, score_breakdown: null, member_a: member(ids[0]), member_b: null, group_members: ids, group_member_details: ids.map(member) }
}
function fixture(): MatchSessionViewProps {
  return { session: { id: "fallback-session", session_name: "已发布分组", status: "confirmed", results_ready: true, total_candidates: 6, total_matched: 6, total_unmatched: 0, round_id: "round", publication_version: 3 }, results: [result("first", ["A", "B", "C"]), result("second", ["D", "E", "F"])], diagnostics: [], candidates: [], boardUnavailable: true, readOnly: true, canViewRawSubmissions: false }
}
let root: Root
beforeEach(() => {
  vi.resetAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  sessionStorage.clear()
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query.includes("min-width: 1024px"), media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })))
  document.body.innerHTML = '<div id="root"></div>'
  root = createRoot(document.getElementById("root")!)
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear()
})

describe("matching board fallback without an editable snapshot", () => {
  it("retains every published group and never reclassifies later groups as unmatched", async () => {
    const props = fixture()
    const snapshot = fallbackBoard(props)
    expect(snapshot.revisionToken).toBe("")
    expect(snapshot.draft.multi).toBeNull()
    expect(snapshot.draft.multiGroups?.map((group) => group.memberIds)).toEqual([["A", "B", "C"], ["D", "E", "F"]])
    expect(snapshot.draft.unmatchedIds).toEqual([])
    await act(async () => root.render(createElement(MatchingBoardView, props)))
    expect([...document.querySelectorAll<HTMLElement>("[data-board-group-key] [data-member-id]")].map((chip) => chip.dataset.memberId)).toEqual(["A", "B", "C", "D", "E", "F"])
    expect(document.querySelector('[data-board-drop-pool="unmatched"] [data-member-id]')).toBeNull()
    expect(document.querySelector('input[data-candidate-member]')).toBeNull()
    expect([...document.querySelectorAll("button")].some((button) => /确认分组|保存调整|确认发布|撤回发布/.test(button.textContent ?? ""))).toBe(false)
    await act(async () => document.querySelector<HTMLButtonElement>('[data-member-id="D"]')!.click())
    expect(document.querySelector('[data-slot="popover-content"]')?.textContent).toContain("成员D")
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it("preserves a legacy ten-person result and ignores cancelled historical groups", () => {
    const props = fixture()
    const ids = Array.from({ length: 10 }, (_, i) => `member-${i}`)
    props.results = [result("legacy", ids), result("historical", ids.slice(0, 3), "cancelled")]
    const snapshot = fallbackBoard(props)
    expect(snapshot.draft.multi?.memberIds).toEqual(ids)
    expect(snapshot.draft.multi?.resultId).toBe("legacy")
    expect(snapshot.draft.multiGroups ?? []).toEqual([])
    expect(snapshot.draft.unmatchedIds).toEqual([])
  })
})
