import { describe, expect, it } from "vitest"
import {
  decodeCommunityContentCursor,
  encodeCommunityContentCursor,
  jstEndExclusive,
  jstStart,
  parseCommunityContentFilters,
  validateCommunityAdminModerationInput,
} from "./admin-content"

describe("community admin content helpers", () => {
  it("parses only supported filters", () => {
    expect(parseCommunityContentFilters({ type: "treehole", status: "hidden", anonymous: "yes", q: "  竹溪  " })).toMatchObject({
      type: "treehole",
      status: "hidden",
      anonymous: true,
      query: "竹溪",
    })
    expect(parseCommunityContentFilters({ type: "unknown", status: "draft" })).toEqual({
      type: undefined, status: undefined, reports: undefined, anonymous: undefined,
      query: undefined, from: undefined, to: undefined, cursor: undefined,
    })
  })

  it("round-trips a strict keyset cursor", () => {
    const cursor = { at: "2026-07-17T00:00:00.000Z", rank: 2, id: "11111111-1111-4111-8111-111111111111" }
    const encoded = encodeCommunityContentCursor(cursor)
    expect(decodeCommunityContentCursor(encoded)).toEqual(cursor)
    expect(parseCommunityContentFilters({ cursor: encoded }).cursor).toBe(encoded)
    expect(decodeCommunityContentCursor("not-a-cursor")).toBeNull()
    expect(parseCommunityContentFilters({ cursor: "not-a-cursor" }).cursor).toBeUndefined()
  })

  it("uses Japan-day boundaries", () => {
    expect(jstStart("2026-07-17")).toBe("2026-07-16T15:00:00.000Z")
    expect(jstEndExclusive("2026-07-17")).toBe("2026-07-17T15:00:00.000Z")
    expect(jstStart("2026-02-29")).toBeNull()
    expect(jstStart("2024-02-29")).toBe("2024-02-28T15:00:00.000Z")
    expect(parseCommunityContentFilters({ from: "2026-02-31", to: "2026-13-01" })).toMatchObject({
      from: undefined,
      to: undefined,
    })
  })

  it("keeps restore and removal reasons separate", () => {
    const base = {
      targetType: "post" as const,
      targetId: "11111111-1111-4111-8111-111111111111",
      postId: "22222222-2222-4222-8222-222222222222",
    }
    expect(validateCommunityAdminModerationInput({ ...base, status: "hidden", reasonCode: "privacy" })).toBeNull()
    expect(validateCommunityAdminModerationInput({ ...base, status: "published", reasonCode: "reviewed_restore" })).toBeNull()
    expect(validateCommunityAdminModerationInput({ ...base, status: "deleted", reasonCode: "reviewed_restore" })).not.toBeNull()
  })
})
