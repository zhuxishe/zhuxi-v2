// @vitest-environment jsdom
import { act, createElement, StrictMode, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { BoardRequest, BoardSmallGroupRecommendationsResult } from "@/lib/matching/board-types"

const mocks = vi.hoisted(() => ({ recommend: vi.fn() }))
vi.mock("@/app/admin/matching/[id]/board-actions", () => ({ recommendBoardSmallGroups: mocks.recommend }))
import { useSmallGroupRecommendations } from "./use-small-group-recommendations"

const group = (key = "rec-1") => ({ key, memberIds: ["A", "B", "C", "D"], bestSlot: "2026-11-01_下午", commonSlots: ["2026-11-01_下午"] })
function deferred() {
  let resolve!: (value: BoardSmallGroupRecommendationsResult) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<BoardSmallGroupRecommendationsResult>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
let root: Root
let input: BoardRequest
let canRecommend: boolean
let blocked: boolean
let state: ReturnType<typeof useSmallGroupRecommendations>
function Harness() {
  const current = useSmallGroupRecommendations(input, canRecommend, blocked)
  useEffect(() => { state = current }, [current])
  return null
}
async function render(strict = false) {
  await act(async () => root.render(strict ? createElement(StrictMode, null, createElement(Harness)) : createElement(Harness)))
}
beforeEach(() => {
  vi.resetAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  document.body.innerHTML = '<div id="root"></div>'
  root = createRoot(document.getElementById("root")!)
  input = { sessionId: "session-1", expectedRevision: "r1", draft: { duos: [], multi: { key: "pool", memberIds: ["A", "B", "C", "D", "E"], bestSlot: "2026-11-01_下午" }, waitingDuoIds: [], brokenPairs: [], unmatchedIds: [] } }
  canRecommend = true
  blocked = false
  mocks.recommend.mockResolvedValue({ success: true, recommendations: [group()], revisionToken: "r1" })
})
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks() })

describe("small group recommendation lifecycle", () => {
  it("automatically loads once without changing the assignment draft", async () => {
    const original = structuredClone(input)
    await render()
    expect(mocks.recommend).toHaveBeenCalledExactlyOnceWith(original)
    expect(state.recommendations).toEqual([group()])
    expect(state.loaded).toBe(true)
    expect(state.loading).toBe(false)
    expect(input).toEqual(original)
    await render()
    expect(mocks.recommend).toHaveBeenCalledTimes(1)
  })

  it("waits for permission and a safe initial state", async () => {
    canRecommend = false
    await render()
    expect(mocks.recommend).not.toHaveBeenCalled()
    canRecommend = true; blocked = true
    await render()
    expect(mocks.recommend).not.toHaveBeenCalled()
    blocked = false
    await render()
    expect(mocks.recommend).toHaveBeenCalledTimes(1)
  })

  it("does not regenerate after manual edits or a refreshed board revision", async () => {
    await render()
    await act(async () => state.setRecommendations([{ ...group(), memberIds: ["A", "B", "C"] }]))
    input = { ...input, expectedRevision: "r2", draft: { ...input.draft, unmatchedIds: ["E"], multi: { ...input.draft.multi!, memberIds: ["A", "B", "C", "D"] } } }
    await render()
    expect(mocks.recommend).toHaveBeenCalledTimes(1)
    expect(state.recommendations[0].memberIds).toEqual(["A", "B", "C"])
    await act(async () => { await state.refresh() })
    expect(mocks.recommend).toHaveBeenLastCalledWith(input)
    expect(state.recommendations).toEqual([group()])
  })

  it("rejects an initial response after the board changed during the request", async () => {
    const request = deferred()
    mocks.recommend.mockReturnValue(request.promise)
    await render()
    expect(state.loading).toBe(true)
    input = { ...input, draft: { ...input.draft, multi: { ...input.draft.multi!, memberIds: ["A", "B", "C", "D"] } } }
    await render()
    await act(async () => request.resolve({ success: true, recommendations: [group()], revisionToken: "r1" }))
    expect(state.recommendations).toEqual([])
    expect(state.error).toContain("人员或方案已调整")
    expect(state.loaded).toBe(false)
    expect(state.loading).toBe(false)
    expect(mocks.recommend).toHaveBeenCalledTimes(1)
  })

  it("keeps edited suggestions if a refresh response is stale", async () => {
    await render()
    const request = deferred()
    mocks.recommend.mockReturnValue(request.promise)
    let work!: Promise<void>
    await act(async () => { work = state.refresh() })
    input = { ...input, expectedRevision: "r2" }
    await render()
    await act(async () => { request.resolve({ success: true, recommendations: [group("replacement")], revisionToken: "r1" }); await work })
    expect(state.recommendations).toEqual([group()])
    expect(state.error).toContain("人员或方案已调整")
  })

  it("accepts only the newest response when manual refreshes overlap", async () => {
    await render()
    const oldRequest = deferred(), newRequest = deferred()
    mocks.recommend.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise)
    let oldWork!: Promise<void>, newWork!: Promise<void>
    await act(async () => { oldWork = state.refresh() })
    await act(async () => { newWork = state.refresh() })
    await act(async () => { newRequest.resolve({ success: true, recommendations: [group("new")], revisionToken: "r1" }); await newWork })
    expect(state.recommendations[0].key).toBe("new")
    await act(async () => { oldRequest.resolve({ success: true, recommendations: [group("old")], revisionToken: "r1" }); await oldWork })
    expect(state.recommendations[0].key).toBe("new")
    expect(state.loading).toBe(false)
  })

  it("does not let an older error interrupt a newer pending request", async () => {
    await render()
    const oldRequest = deferred(), newRequest = deferred()
    mocks.recommend.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise)
    let oldWork!: Promise<void>, newWork!: Promise<void>
    await act(async () => { oldWork = state.refresh() })
    await act(async () => { newWork = state.refresh() })
    await act(async () => { oldRequest.reject(new Error("old network failure")); await oldWork })
    expect(state.error).toBe("")
    expect(state.loading).toBe(true)
    await act(async () => { newRequest.resolve({ success: true, recommendations: [], revisionToken: "r1" }); await newWork })
    expect(state.loaded).toBe(true)
    expect(state.loading).toBe(false)
    expect(state.recommendations).toEqual([])
  })

  it("keeps existing recommendations after a server rejection and supports explicit retry", async () => {
    await render()
    mocks.recommend.mockResolvedValueOnce({ error: "方案已变化，请刷新。" })
    await act(async () => { await state.refresh() })
    expect(state.error).toBe("方案已变化，请刷新。")
    expect(state.recommendations).toEqual([group()])
    mocks.recommend.mockResolvedValueOnce({ success: true, recommendations: [], revisionToken: "r1" })
    await act(async () => { await state.refresh() })
    expect(state.error).toBe("")
    expect(state.recommendations).toEqual([])
    expect(state.loaded).toBe(true)
  })

  it("reports transport failures without treating them as empty recommendations", async () => {
    mocks.recommend.mockRejectedValueOnce(new Error("network failed"))
    await render()
    expect(state.error).toContain("暂时无法生成推荐")
    expect(state.loaded).toBe(false)
    expect(state.loading).toBe(false)
    await render()
    expect(mocks.recommend).toHaveBeenCalledTimes(1)
    await act(async () => { await state.refresh() })
    expect(state.error).toBe("")
    expect(state.loaded).toBe(true)
  })

  it("ignores the abandoned StrictMode request and displays the active request", async () => {
    const abandoned = deferred(), active = deferred()
    mocks.recommend.mockReturnValueOnce(abandoned.promise).mockReturnValueOnce(active.promise)
    await render(true)
    expect(mocks.recommend).toHaveBeenCalledTimes(2)
    await act(async () => active.resolve({ success: true, recommendations: [group("active")], revisionToken: "r1" }))
    await act(async () => abandoned.resolve({ success: true, recommendations: [group("abandoned")], revisionToken: "r1" }))
    expect(state.recommendations[0].key).toBe("active")
    expect(state.loading).toBe(false)
  })
})
