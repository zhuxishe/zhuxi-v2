import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), createAdminClient: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))

import { fetchDuplicateMemberNames } from "./duplicate-member-names"

const row = (id: string, name: string) => ({ id, member_identity: { full_name: name, nickname: null, school_name: "测试大学" } })
type Response = { data: ReturnType<typeof row>[] | null; error: { message: string } | null }

function database(responses: Response[]) {
  const batches = [...responses]
  const query = {
    select: vi.fn(), eq: vi.fn(), neq: vi.fn(), is: vi.fn(), order: vi.fn(), limit: vi.fn(), gt: vi.fn(),
    returns: vi.fn(async () => {
      const response = batches.shift()
      if (!response) throw new Error("Unexpected extra batch")
      return response
    }),
  }
  for (const method of [query.select, query.eq, query.neq, query.is, query.order, query.limit, query.gt]) method.mockReturnValue(query)
  mocks.createAdminClient.mockReturnValue({ from: vi.fn(() => query) })
  return query
}

describe("admin duplicate name lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ role: "admin" })
  })

  it("detects names across batches, including API batches smaller than the requested limit", async () => {
    const query = database([
      { data: [row("a", "张三"), row("b", "李四")], error: null },
      { data: [row("c", "张三")], error: null },
      { data: [], error: null },
    ])
    const groups = await fetchDuplicateMemberNames()
    expect(groups?.[0].members.map((member) => member.id)).toEqual(["a", "c"])
    expect(query.gt.mock.calls).toEqual([["id", "b"], ["id", "c"]])
    expect(query.eq).toHaveBeenCalledWith("record_scope", "current")
    expect(query.neq).toHaveBeenCalledWith("account_status", "unbound")
    expect(query.is).toHaveBeenCalledWith("anonymized_at", null)
    expect(query.select).toHaveBeenCalledWith("id,member_identity!inner(full_name,nickname,school_name)")
  })

  it("does not access the service client without administrator authorization", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("not authorized"))
    await expect(fetchDuplicateMemberNames()).rejects.toThrow("not authorized")
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it.each([
    { data: null, error: { message: "database unavailable" } },
    { data: null, error: null },
  ])("does not report no duplicates when a later batch fails", async (failure) => {
    database([{ data: [row("a", "张三")], error: null }, failure])
    expect(await fetchDuplicateMemberNames()).toBeNull()
  })

  it("returns an empty result after a successful complete scan", async () => {
    database([{ data: [row("a", "")], error: null }, { data: [], error: null }])
    expect(await fetchDuplicateMemberNames()).toEqual([])
  })

  it("stops with an error if a batch does not advance", async () => {
    database([{ data: [row("a", "张三")], error: null }, { data: [row("a", "张三")], error: null }])
    expect(await fetchDuplicateMemberNames()).toBeNull()
  })
})
