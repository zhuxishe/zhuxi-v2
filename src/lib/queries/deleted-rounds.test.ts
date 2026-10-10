import { createClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }))
import { fetchDeletedRounds } from "./deleted-rounds"

const row = { id: "deleted-round", round_name: "测试活动", purpose: "registration", activity_start: "2026-10-10", activity_end: "2026-10-11", survey_end: "2026-10-09T14:59:00Z", deleted_at: "2026-10-10T10:00:00Z", deleted_admin_email: "admin@example.test" as string | null, executor_name: "执行人" as string | null, reason: "重复创建活动" as string | null, legacy: false }
let rows: typeof row[]
let requests: { url: URL; args: { p_limit: number; p_offset: number } }[]
let unavailable: boolean
let malformed: boolean

describe("deleted matching activities query", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.admin.mockResolvedValue({ role: "super_admin" })
    rows = [row]; requests = []; unavailable = false; malformed = false
    mocks.client.mockResolvedValue(createClient("https://deleted-rounds-test.invalid", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input, init) => {
        const url = new URL(String(input)), args = JSON.parse(String(init?.body))
        requests.push({ url, args })
        if (unavailable) return new Response(JSON.stringify({ message: "ROUND_DELETE_FORBIDDEN", code: "42501" }), { status: 403 })
        const data = malformed ? { total: null, items: [] } : { total: rows.length, items: rows.slice(args.p_offset, args.p_offset + args.p_limit) }
        return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } })
      } },
    }))
  })

  it("does not create a client or request deletion metadata for ordinary administrators", async () => {
    mocks.admin.mockResolvedValue({ role: "admin" })
    expect(await fetchDeletedRounds(1)).toBeNull()
    expect(mocks.client).not.toHaveBeenCalled()
    expect(requests).toHaveLength(0)
  })

  it("requires an administrator before accessing private deletion information", async () => {
    mocks.admin.mockRejectedValue(new Error("redirect"))
    await expect(fetchDeletedRounds()).rejects.toThrow("redirect")
    expect(mocks.client).not.toHaveBeenCalled()
  })

  it("loads only a bounded page through the dedicated authenticated RPC", async () => {
    rows = Array.from({ length: 23 }, (_, index) => ({ ...row, id: `deleted-${index}` }))
    const result = await fetchDeletedRounds("2")
    expect(result).toMatchObject({ total: 23, page: 2, pageSize: 10, totalPages: 3 })
    expect(result?.items).toHaveLength(10)
    expect(result?.items[0]).toMatchObject({ id: "deleted-10", roundName: row.round_name, deletedAdminEmail: row.deleted_admin_email, executorName: row.executor_name, reason: row.reason })
    expect(requests).toEqual([{ url: expect.any(URL), args: { p_limit: 10, p_offset: 10 } }])
    expect(requests[0].url.pathname).toBe("/rest/v1/rpc/admin_list_deleted_match_rounds")
    expect(result?.items[0]).not.toHaveProperty("survey_end")
  })

  it.each([0, -1, 1.5, "invalid", ["2"], Number.POSITIVE_INFINITY])("uses the first bounded page for invalid input %s", async (page) => {
    expect((await fetchDeletedRounds(page))?.page).toBe(1)
    expect(requests[0].args).toEqual({ p_limit: 10, p_offset: 0 })
  })

  it("limits an oversized page offset and moves an obsolete page to the last available page", async () => {
    rows = Array.from({ length: 12 }, (_, index) => ({ ...row, id: `deleted-${index}` }))
    const result = await fetchDeletedRounds(Number.MAX_SAFE_INTEGER)
    expect(requests[0].args).toEqual({ p_limit: 10, p_offset: 1000000 })
    expect(requests[1].args).toEqual({ p_limit: 10, p_offset: 10 })
    expect(result).toMatchObject({ page: 2, total: 12, totalPages: 2 })
    expect(result?.items.map((item) => item.id)).toEqual(["deleted-10", "deleted-11"])
  })

  it("preserves missing legacy metadata without guessing the current admin's identity", async () => {
    rows = [{ ...row, deleted_admin_email: null, executor_name: null, reason: null, legacy: true }]
    expect((await fetchDeletedRounds())?.items[0]).toMatchObject({ deletedAdminEmail: null, executorName: null, reason: null, legacy: true })
  })

  it("surfaces denied or malformed data instead of displaying a false zero count", async () => {
    unavailable = true
    await expect(fetchDeletedRounds()).rejects.toThrow("Unable to load")
    unavailable = false; malformed = true
    await expect(fetchDeletedRounds()).rejects.toThrow("Unable to load")
  })
})
