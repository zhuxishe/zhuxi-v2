import { createClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.client }))
import { fetchPendingApplicationCount, fetchPendingApplicationForApproval, fetchPendingApplications } from "./pending-applications"
import { fetchDashboardStats } from "./admin"

const id = "11111111-1111-4111-8111-111111111111"
const base = {
  id, record_scope: "current", account_status: "active", status: "pending", record_source: "app",
  profile_stage: "submitted", onboarding_step: 4, submitted_at: "2026-10-01T00:00:00Z",
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
  member_identity: {
    id: "identity", full_name: "申请人", nickname: "昵称", school_name: "大学", gender: "other",
    age_range: "20-24", nationality: "中国", current_city: "东京", hobby_tags: ["音乐"],
    activity_type_tags: ["桌游"], personality_self_tags: ["温和"],
  },
}
let rows: Array<Omit<typeof base, "member_identity"> & { member_identity: typeof base.member_identity | null }>
let requests: URL[]
let denied: boolean

describe("pending applications with the real Supabase request builder", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    rows = [base]; requests = []; denied = false
    mocks.admin.mockResolvedValue({ id: "admin" })
    mocks.client.mockReturnValue(createClient("https://pending-test.invalid", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input, init) => {
        const url = new URL(String(input)); requests.push(url)
        if (denied) return new Response(JSON.stringify({ code: "42501", message: "Denied" }), { status: 403 })
        const p = url.searchParams
        const filtered = rows.filter((row) => {
          for (const key of ["id", "record_scope", "account_status", "status", "onboarding_step"] as const) {
            const filter = p.get(key)
            if (filter?.startsWith("eq.") && filter !== `eq.${row[key]}`) return false
            if (filter?.startsWith("neq.") && filter === `neq.${row[key]}`) return false
          }
          return (!p.get("profile_stage") || p.get("profile_stage")!.slice(4, -1).split(",").includes(row.profile_stage))
            && (!p.get("select")?.includes("!inner") || row.member_identity !== null)
        })
        const offset = Number(p.get("offset") ?? 0), limit = Number(p.get("limit") ?? filtered.length)
        const body = init?.method === "HEAD" ? null : JSON.stringify(filtered.slice(offset, offset + limit))
        return new Response(body, { headers: { "content-type": "application/json", "content-range": `0-${filtered.length - 1}/${filtered.length}` } })
      } },
    }))
  })

  it("keeps the count, dashboard, list and approval lookup on exactly the same eligibility scope", async () => {
    rows = [base, { ...base, id: "complete", profile_stage: "complete" },
      { ...base, id: "historical", record_scope: "historical" }, { ...base, id: "inactive", account_status: "suspended" },
      { ...base, id: "done", status: "approved" }, { ...base, id: "draft", profile_stage: "in_progress" },
      { ...base, id: "step", onboarding_step: 3 }, { ...base, id: "identity", member_identity: null }]
    expect(await fetchPendingApplicationCount()).toBe(2)
    expect((await fetchDashboardStats()).pending).toBe(2)
    expect((await fetchPendingApplications()).items.map((item) => item.id)).toEqual([id, "complete"])
    expect(await fetchPendingApplicationForApproval("done")).toBeNull()
    expect((await fetchPendingApplicationForApproval(id))?.id).toBe(id)
    const scope = requests.filter((r) => r.searchParams.has("onboarding_step"))
    expect(scope.length).toBeGreaterThan(4)
    for (const request of scope) {
      expect(request.searchParams.get("record_scope")).toBe("eq.current")
      expect(request.searchParams.get("account_status")).toBe("eq.active")
      expect(request.searchParams.get("status")).toBe("eq.pending")
      expect(request.searchParams.get("profile_stage")).toBe("in.(submitted,complete)")
      expect(request.searchParams.get("onboarding_step")).toBe("eq.4")
      expect(request.searchParams.get("select")).toContain("member_identity!inner(")
    }
  })

  it("returns only display data and a block reason while preserving the write version", async () => {
    rows = [{ ...base, member_identity: { ...base.member_identity, hobby_tags: [] } }]
    const item = (await fetchPendingApplications()).items[0]
    expect(item.blockReason).toContain("注册必填资料不完整")
    expect(item.updatedAt).toBe(base.updated_at)
    expect(Object.keys(item).sort()).toEqual(["id", "fullName", "nickname", "schoolName", "submittedAt", "createdAt", "updatedAt", "blockReason"].sort())
    expect(JSON.stringify(item)).not.toContain("nationality")
  })

  it("clamps an out-of-range page, uses 50 rows and orders oldest submissions first", async () => {
    rows = Array.from({ length: 51 }, (_, index) => ({ ...base, id: String(index) }))
    const result = await fetchPendingApplications({ page: 99 })
    expect(result).toMatchObject({ page: 2, total: 51, pageSize: 50 })
    expect(result.items).toHaveLength(1)
    expect(requests[1].searchParams.get("offset")).toBe("50")
    expect(requests[1].searchParams.get("limit")).toBe("50")
    expect(requests[1].searchParams.get("order")).toBe("submitted_at.asc.nullslast,created_at.asc,id.asc")
  })

  it("returns page one for empty results and invalid page numbers", async () => {
    rows = []
    expect(await fetchPendingApplications({ page: Infinity })).toEqual({ items: [], total: 0, page: 1, pageSize: 50 })
    expect(requests).toHaveLength(1)
  })

  it("quotes PostgREST syntax and escapes literal LIKE wildcards for all three identity columns", async () => {
    await fetchPendingApplications({ search: 'A%,_()."\\' })
    const pattern = '"%A\\\\%,\\\\_().\\"\\\\\\\\%"'
    const expected = `(${["full_name", "nickname", "school_name"].map((field) => `${field}.ilike.${pattern}`).join(",")})`
    for (const request of requests) expect(request.searchParams.get("member_identity.or")).toBe(expected)
  })

  it("keeps a literal asterisk from turning the entire search into a wildcard", async () => {
    await fetchPendingApplications({ search: "A*B" })
    expect(requests[0].searchParams.get("member_identity.or")).toBe('(full_name.imatch."A\\\\*B",nickname.imatch."A\\\\*B",school_name.imatch."A\\\\*B")')
  })

  it("checks admin permission before creating a service-role client", async () => {
    mocks.admin.mockRejectedValue(new Error("not admin"))
    await expect(fetchPendingApplications()).rejects.toThrow("not admin")
    await expect(fetchPendingApplicationCount()).rejects.toThrow("not admin")
    await expect(fetchPendingApplicationForApproval(id)).rejects.toThrow("not admin")
    expect(mocks.client).not.toHaveBeenCalled()
  })

  it("surfaces query failure instead of reporting an empty queue", async () => {
    denied = true
    await expect(fetchPendingApplications()).rejects.toThrow("无法读取")
    await expect(fetchPendingApplicationForApproval(id)).rejects.toThrow("无法读取")
  })
})
