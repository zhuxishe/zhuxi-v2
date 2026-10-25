import { createClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.client }))
import { fetchIgnoredApplications, fetchPendingApplicationCount, fetchPendingApplicationForApproval, fetchPendingApplications } from "./pending-applications"
import { fetchDashboardStats } from "./admin"

const id = "11111111-1111-4111-8111-111111111111"
const base = {
  id, is_test: false, record_scope: "current", account_status: "active", status: "pending", record_source: "app",
  profile_stage: "submitted", onboarding_step: 4, submitted_at: "2026-10-01T00:00:00Z",
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
  member_identity: {
    id: "identity", full_name: "申请人", nickname: "昵称", school_name: "大学", gender: "other",
    age_range: "20-24", nationality: "中国", current_city: "东京", hobby_tags: ["音乐"],
    activity_type_tags: ["桌游"], personality_self_tags: ["温和"],
  },
}
const ignoreRecord = { member_id: id, ignored_at: "2026-10-23T10:00:00Z", actor_name: "管理员", reason: "非目标申请" }
let rows: Array<Omit<typeof base, "member_identity"> & {
  member_identity: typeof base.member_identity | null
  application_ignore?: typeof ignoreRecord | null
}>
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
        let filtered = rows.filter((row) => {
          for (const key of ["id", "record_scope", "account_status", "status", "onboarding_step", "is_test"] as const) {
            const filter = p.get(key)
            if (filter?.startsWith("eq.") && filter !== `eq.${row[key]}`) return false
            if (filter?.startsWith("neq.") && filter === `neq.${row[key]}`) return false
          }
          return (!p.get("profile_stage") || p.get("profile_stage")!.slice(4, -1).split(",").includes(row.profile_stage))
            && (!p.get("select")?.includes("member_identity!inner(") || row.member_identity !== null)
            && (p.get("application_ignore") !== "is.null" || !row.application_ignore)
            && (!p.get("select")?.includes("application_ignore:member_application_ignores!inner(") || !!row.application_ignore)
        })
        if (p.get("order") === "application_ignore(ignored_at).desc,id.asc") {
          filtered = [...filtered].sort((a, b) => b.application_ignore!.ignored_at.localeCompare(a.application_ignore!.ignored_at) || a.id.localeCompare(b.id))
        }
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
      { ...base, id: "step", onboarding_step: 3 }, { ...base, id: "identity", member_identity: null },
      { ...base, id: "ignored", application_ignore: ignoreRecord }, { ...base, id: "test", is_test: true }]
    expect(await fetchPendingApplicationCount()).toBe(2)
    expect((await fetchDashboardStats()).pending).toBe(2)
    expect((await fetchPendingApplications()).items.map((item) => item.id)).toEqual([id, "complete"])
    expect(await fetchPendingApplicationForApproval("done")).toBeNull()
    expect(await fetchPendingApplicationForApproval("ignored")).toBeNull()
    expect((await fetchPendingApplicationForApproval(id))?.id).toBe(id)
    const scope = requests.filter((r) => r.searchParams.has("onboarding_step"))
    expect(scope.length).toBeGreaterThan(4)
    for (const request of scope) {
      expect(request.searchParams.get("record_scope")).toBe("eq.current")
      expect(request.searchParams.get("is_test")).toBe("eq.false")
      expect(request.searchParams.get("account_status")).toBe("eq.active")
      expect(request.searchParams.get("status")).toBe("eq.pending")
      expect(request.searchParams.get("profile_stage")).toBe("in.(submitted,complete)")
      expect(request.searchParams.get("onboarding_step")).toBe("eq.4")
      expect(request.searchParams.get("select")).toContain("member_identity!inner(")
      expect(request.searchParams.get("select")).toContain("application_ignore:member_application_ignores(member_id)")
      expect(request.searchParams.get("application_ignore")).toBe("is.null")
      expect(request.searchParams.has("id") && request.searchParams.get("id")?.startsWith("not.in.")).toBe(false)
    }
  })

  it("counts current active directory members, including drafts, without closed or suspended accounts", async () => {
    rows = [
      base,
      { ...base, id: "approved", status: "approved" },
      { ...base, id: "rejected", status: "rejected" },
      { ...base, id: "draft", profile_stage: "in_progress", onboarding_step: 1 },
      { ...base, id: "blank", profile_stage: "not_started", onboarding_step: 0, member_identity: null },
      { ...base, id: "inactive", status: "inactive" },
      { ...base, id: "historical", record_scope: "historical", status: "approved" },
      { ...base, id: "suspended", account_status: "suspended", status: "approved" },
      { ...base, id: "closed", account_status: "closed", status: "approved" },
      { ...base, id: "anonymized", account_status: "closed", status: "inactive", member_identity: null },
      { ...base, id: "unbound", account_status: "unbound", status: "approved" },
      { ...base, id: "test-player", is_test: true, status: "approved" },
    ]

    expect(await fetchDashboardStats()).toEqual({ total: 6, pending: 1, approved: 1, rejected: 1 })
    for (const request of requests) {
      expect(request.searchParams.get("record_scope")).toBe("eq.current")
      expect(request.searchParams.get("account_status")).toBe("eq.active")
      expect(request.searchParams.get("is_test")).toBe("eq.false")
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

  it("lists only ignored applications in the same current active submitted scope with audit metadata", async () => {
    rows = [base, { ...base, id: "ignored", application_ignore: ignoreRecord },
      { ...base, id: "complete", profile_stage: "complete", application_ignore: ignoreRecord },
      { ...base, id: "historical", record_scope: "historical", application_ignore: ignoreRecord },
      { ...base, id: "inactive", account_status: "suspended", application_ignore: ignoreRecord },
      { ...base, id: "done", status: "approved", application_ignore: ignoreRecord },
      { ...base, id: "draft", profile_stage: "in_progress", application_ignore: ignoreRecord },
      { ...base, id: "step", onboarding_step: 3, application_ignore: ignoreRecord },
      { ...base, id: "identity", member_identity: null, application_ignore: ignoreRecord }]

    const result = await fetchIgnoredApplications()
    expect(result).toMatchObject({ total: 2, page: 1, pageSize: 50 })
    expect(result.items.map((item) => item.id)).toEqual(["complete", "ignored"])
    expect(result.items[0]).toMatchObject({ ignoredAt: ignoreRecord.ignored_at, ignoredByName: "管理员", ignoreReason: "非目标申请", updatedAt: base.updated_at })
    expect(JSON.stringify(result)).not.toContain("nationality")
    for (const request of requests) {
      expect(request.pathname).toBe("/rest/v1/members")
      expect(request.searchParams.get("record_scope")).toBe("eq.current")
      expect(request.searchParams.get("account_status")).toBe("eq.active")
      expect(request.searchParams.get("status")).toBe("eq.pending")
      expect(request.searchParams.get("profile_stage")).toBe("in.(submitted,complete)")
      expect(request.searchParams.get("onboarding_step")).toBe("eq.4")
      expect(request.searchParams.get("select")).toContain("member_identity!inner(")
      expect(request.searchParams.get("select")).toContain("application_ignore:member_application_ignores!inner(ignored_at,actor_name,reason)")
      expect(request.searchParams.has("application_ignore")).toBe(false)
    }
  })

  it("paginates ignored applications by newest ignore time with a stable member ID tie-break", async () => {
    rows = Array.from({ length: 51 }, (_, index) => ({
      ...base, id: String(index).padStart(3, "0"), application_ignore: { ...ignoreRecord, ignored_at: "2026-10-22T10:00:00Z" },
    }))
    rows[50].application_ignore!.ignored_at = "2026-10-23T10:00:00Z"
    const first = await fetchIgnoredApplications()
    expect(first.items[0].id).toBe("050")
    expect(first.items[1].id).toBe("000")
    const last = await fetchIgnoredApplications({ page: 99 })
    expect(last).toMatchObject({ total: 51, page: 2, pageSize: 50 })
    expect(last.items.map((item) => item.id)).toEqual(["049"])
    expect(requests[3].searchParams.get("offset")).toBe("50")
    expect(requests[3].searchParams.get("limit")).toBe("50")
    expect(requests[3].searchParams.get("order")).toBe("application_ignore(ignored_at).desc,id.asc")
    expect(requests[3].searchParams.has("application_ignore.order")).toBe(false)
  })

  it("returns an empty ignored page without fetching a list when no ignored candidates remain", async () => {
    expect(await fetchIgnoredApplications({ page: -1 })).toEqual({ items: [], total: 0, page: 1, pageSize: 50 })
    expect(requests).toHaveLength(1)
  })

  it("uses the same literal search escaping for the ignored list and its count", async () => {
    rows = [{ ...base, application_ignore: ignoreRecord }]
    await fetchIgnoredApplications({ search: 'A%,_()."\\' })
    const pattern = '"%A\\\\%,\\\\_().\\"\\\\\\\\%"'
    const expected = `(${["full_name", "nickname", "school_name"].map((field) => `${field}.ilike.${pattern}`).join(",")})`
    expect(requests).toHaveLength(2)
    for (const request of requests) expect(request.searchParams.get("member_identity.or")).toBe(expected)
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
    await expect(fetchIgnoredApplications()).rejects.toThrow("not admin")
    expect(mocks.client).not.toHaveBeenCalled()
  })

  it("surfaces query failure instead of reporting an empty queue", async () => {
    denied = true
    await expect(fetchPendingApplications()).rejects.toThrow("无法读取")
    await expect(fetchPendingApplicationForApproval(id)).rejects.toThrow("无法读取")
    await expect(fetchIgnoredApplications()).rejects.toThrow("无法读取已忽略")
  })
})
