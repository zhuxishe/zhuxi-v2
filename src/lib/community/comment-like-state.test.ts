import { describe, expect, it } from "vitest"
import { commentLikeReducer as reduce, createCommentLikeState } from "./comment-like-state"

describe("comment likes during writes and background refreshes", () => {
  it("applies one optimistic increment and ignores a duplicate pending click", () => {
    const initial = createCommentLikeState({ liked: false, count: 2, version: 2 })
    const pending = reduce(initial, { type: "start" })
    expect(pending).toMatchObject({ liked: true, count: 3, pending: true })
    expect(reduce(pending, { type: "start" })).toBe(pending)
    expect(reduce(pending, { type: "success", snapshot: { liked: true, count: 7, version: 7 } }))
      .toMatchObject({ liked: true, count: 7, pending: false })
  })

  it("keeps optimistic feedback during a refresh and accepts the authoritative RPC result", () => {
    let state = createCommentLikeState({ liked: false, count: 2, version: 2 })
    state = reduce(state, { type: "start" })
    state = reduce(state, { type: "sync", snapshot: { liked: false, count: 6, version: 6 } })
    expect(state).toMatchObject({ liked: true, count: 3, pending: true })
    state = reduce(state, { type: "success", snapshot: { liked: true, count: 7, version: 7 } })
    expect(reduce(state, { type: "sync", snapshot: { liked: false, count: 6, version: 6 } })).toBe(state)
    expect(reduce(state, { type: "sync", snapshot: { liked: true, count: 8, version: 8 } }))
      .toMatchObject({ liked: true, count: 8, pending: false })
  })

  it("rolls back a failed write to the newest verified refresh", () => {
    let state = createCommentLikeState({ liked: false, count: 2, version: 2 })
    state = reduce(state, { type: "start" })
    state = reduce(state, { type: "sync", snapshot: { liked: false, count: 6, version: 6 } })
    expect(reduce(state, { type: "failure", error: "Try again" }))
      .toMatchObject({ liked: false, count: 6, pending: false, error: "Try again" })
  })

  it("retains an already confirmed local result when a later cancellation fails without a refresh", () => {
    let state = createCommentLikeState({ liked: false, count: 2, version: 2 })
    state = reduce(state, { type: "start" })
    state = reduce(state, { type: "success", snapshot: { liked: true, count: 7, version: 7 } })
    state = reduce(state, { type: "start" })
    expect(state).toMatchObject({ liked: false, count: 6, version: 7 })
    state = reduce(state, { type: "failure", error: "Offline" })
    expect(state).toMatchObject({ liked: true, count: 7, pending: false })
    expect(reduce(state, { type: "start" })).toMatchObject({ liked: false, count: 6, error: "" })
  })

  it("updates from a later background refresh while idle", () => {
    const initial = createCommentLikeState({ liked: true, count: 4, version: 4 })
    expect(reduce(initial, { type: "sync", snapshot: { liked: false, count: 9, version: 9 } }))
      .toMatchObject({ liked: false, count: 9, pending: false })
  })

  it("does not display a negative count while cancelling an inconsistent old snapshot", () => {
    expect(reduce(createCommentLikeState({ liked: true, count: 0, version: 0 }), { type: "start" }).count).toBe(0)
  })

  it("ignores a delayed pre-write poll even when its count differs from the original props", () => {
    let state = createCommentLikeState({ liked: false, count: 2, version: 2 })
    state = reduce(state, { type: "start" })
    state = reduce(state, { type: "success", snapshot: { liked: true, count: 4, version: 4 } })
    state = reduce(state, { type: "sync", snapshot: { liked: false, count: 3, version: 3 } })
    expect(state).toMatchObject({ liked: true, count: 4, version: 4, pending: false })
    // A later unlike decreases the count but advances the version and must apply.
    expect(reduce(state, { type: "sync", snapshot: { liked: false, count: 3, version: 5 } }))
      .toMatchObject({ liked: false, count: 3, version: 5 })
  })

  it("keeps a newer polled snapshot when an older write response arrives afterwards", () => {
    let state = createCommentLikeState({ liked: false, count: 2, version: 2 })
    state = reduce(state, { type: "start" })
    state = reduce(state, { type: "sync", snapshot: { liked: false, count: 2, version: 4 } })
    expect(state).toMatchObject({ liked: true, count: 3, version: 4, pending: true })
    expect(reduce(state, { type: "success", snapshot: { liked: true, count: 3, version: 3 } }))
      .toMatchObject({ liked: false, count: 2, version: 4, pending: false })
  })

  it("cannot roll back to an older poll that arrives after a newer snapshot during a failed write", () => {
    let state = createCommentLikeState({ liked: false, count: 2, version: 2 })
    state = reduce(state, { type: "start" })
    state = reduce(state, { type: "sync", snapshot: { liked: false, count: 5, version: 5 } })
    state = reduce(state, { type: "sync", snapshot: { liked: false, count: 4, version: 4 } })
    expect(reduce(state, { type: "failure", error: "Offline" }))
      .toMatchObject({ liked: false, count: 5, version: 5, pending: false })
  })

  it("ignores conflicting snapshots at the same database version", () => {
    const state = createCommentLikeState({ liked: true, count: 4, version: 9 })
    expect(reduce(state, { type: "sync", snapshot: { liked: false, count: 3, version: 9 } }))
      .toMatchObject({ liked: true, count: 4, version: 9 })
  })

  it("accepts an idempotent successful result at the same version as a received snapshot", () => {
    let state = createCommentLikeState({ liked: false, count: 2, version: 2 })
    state = reduce(state, { type: "start" })
    state = reduce(state, { type: "sync", snapshot: { liked: true, count: 3, version: 3 } })
    expect(reduce(state, { type: "success", snapshot: { liked: true, count: 3, version: 3 } }))
      .toMatchObject({ liked: true, count: 3, version: 3, pending: false })
  })
})
