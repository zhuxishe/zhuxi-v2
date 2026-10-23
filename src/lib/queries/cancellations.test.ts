import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), service: vi.fn(), client: vi.fn(), names: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.service }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }))
vi.mock("./group-members", () => ({ fetchGroupMemberNames: mocks.names }))
import { fetchCancellationCount, fetchPendingCancellations } from "./cancellations"

const current = { id: "current", status: "confirmed", publication_version: 2,
  cancellation_status: "pending", cancellation_publication_version: 2,
  cancellation_requested_at: "2026-10-23T12:34:56.123456Z", group_members: ["member-a", "member-b", "member-c"],
  session: { status: "confirmed", publication_version: 2 } }
const rows = [current, { ...current, id: "old", cancellation_publication_version: 1 },
  { ...current, id: "withdrawn", session: { status: "draft", publication_version: 2 } }]
function database(error: Error | null = null) {
  const builder = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(),
    then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: rows, error }).then(resolve) }
  builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder); builder.order.mockReturnValue(builder); builder.range.mockReturnValue(builder)
  return { from: vi.fn(() => builder), builder }
}

describe("current publication cancellation queue", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.names.mockResolvedValue([{ id: "member-a", name: "甲" }]) })
  it("guards the private member read and only returns current requests", async () => {
    const db = database(); mocks.service.mockReturnValue(db)
    const result = await fetchPendingCancellations()
    expect(result.map(r => r.id)).toEqual(["current"])
    expect(result[0].cancellation_publication_version).toBe(2)
    expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.service.mock.invocationCallOrder[0])
    expect(mocks.names).toHaveBeenCalledWith(["member-a", "member-b", "member-c"])
    expect(result[0].group_member_names).toEqual(["甲", "未知", "未知"])
  })
  it("navigation count uses the same current-publication criteria as the queue", async () => {
    mocks.client.mockResolvedValue(database())
    expect(await fetchCancellationCount()).toBe(1)
  })
  it("counts beyond the Data API 1000-row response limit with deterministic page order", async () => {
    const db = database()
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({ ...current, id: `current-${index}` }))
    db.builder.range.mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: [current, rows[1]], error: null })
    mocks.client.mockResolvedValue(db)
    expect(await fetchCancellationCount()).toBe(1001)
    expect(db.builder.range.mock.calls).toEqual([[0, 999], [1000, 1999]])
    expect(db.builder.order).toHaveBeenNthCalledWith(1, "id", { ascending: true })
    expect(db.builder.order).toHaveBeenNthCalledWith(2, "id", { ascending: true })
    expect(db.builder.select.mock.calls[0][0]).not.toContain("cancellation_reason")
  })
  it("does not present a partial count if a later page fails", async () => {
    const db = database()
    db.builder.range.mockResolvedValueOnce({ data: Array.from({ length: 1000 }, () => current), error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("second page unavailable") })
    mocks.client.mockResolvedValue(db)
    expect(await fetchCancellationCount()).toBe(0)
    expect(db.builder.range).toHaveBeenCalledTimes(2)
  })
  it("finishes an exact full page by fetching the following empty page", async () => {
    const db = database()
    db.builder.range.mockResolvedValueOnce({ data: Array.from({ length: 1000 }, () => current), error: null })
      .mockResolvedValueOnce({ data: [], error: null })
    mocks.client.mockResolvedValue(db)
    expect(await fetchCancellationCount()).toBe(1000)
    expect(db.builder.range).toHaveBeenCalledTimes(2)
  })
  it("fails closed for list reads and preserves the existing quiet count fallback", async () => {
    const error = new Error("database unavailable")
    mocks.service.mockReturnValue(database(error)); mocks.client.mockResolvedValue(database(error))
    await expect(fetchPendingCancellations()).rejects.toThrow(error)
    expect(await fetchCancellationCount()).toBe(0)
  })
})
