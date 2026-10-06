import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { requireAdminMock, requireSuperAdminMock, createClientMock, rpcMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  requireSuperAdminMock: vi.fn(),
  createClientMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: requireAdminMock, requireSuperAdmin: requireSuperAdminMock }))
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }))

import { fetchLegacyMemberStatus, fetchMemberOverviewMetrics } from "./member-overview"

const validMetrics = { male_count: 12, female_count: 8, legacy_total: 247, legacy_activated: 14 }
const validItem = {
  full_name: "测试名单成员",
  member_number: "ZXS_001",
  member_id: "8ea1c1fd-103a-4c41-b649-2b8c3ebd703d",
  registered: true,
  approved: false,
  has_logged_in: true,
  last_sign_in_at: "2026-10-06T08:30:00Z",
  account_status: "active",
  activated: true,
}
const validPage = {
  items: [validItem],
  total: 1,
  page: 1,
  page_size: 50,
  total_pages: 1,
  summary: { total: 247, activated: 14 },
}

beforeEach(() => {
  requireAdminMock.mockReset().mockResolvedValue({ role: "admin" })
  requireSuperAdminMock.mockReset().mockResolvedValue({ role: "super_admin" })
  createClientMock.mockReset().mockResolvedValue({ rpc: rpcMock })
  rpcMock.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

describe("fetchMemberOverviewMetrics", () => {
  it("uses the authenticated session RPC after the admin guard", async () => {
    rpcMock.mockResolvedValue({ data: validMetrics, error: null })
    await expect(fetchMemberOverviewMetrics()).resolves.toEqual({
      maleCount: 12, femaleCount: 8, legacyTotal: 247, legacyActivated: 14,
    })
    expect(requireAdminMock).toHaveBeenCalledOnce()
    expect(rpcMock).toHaveBeenCalledWith("admin_member_dashboard_metrics")
    expect(requireAdminMock.mock.invocationCallOrder[0]).toBeLessThan(createClientMock.mock.invocationCallOrder[0])
  })

  it("keeps legitimate zeros separate from a failed read", async () => {
    rpcMock.mockResolvedValue({ data: { male_count: 0, female_count: 0, legacy_total: 0, legacy_activated: 0 }, error: null })
    await expect(fetchMemberOverviewMetrics()).resolves.toEqual({ maleCount: 0, femaleCount: 0, legacyTotal: 0, legacyActivated: 0 })
    expect(console.error).not.toHaveBeenCalled()

    rpcMock.mockResolvedValue({ data: null, error: { message: "private roster details" } })
    await expect(fetchMemberOverviewMetrics()).resolves.toBeNull()
    expect(console.error).toHaveBeenCalledWith("[member-overview] dashboard metrics unavailable")
  })

  it.each([
    null,
    { ...validMetrics, male_count: -1 },
    { ...validMetrics, female_count: "8" },
    { ...validMetrics, female_count: 0.5 },
    { ...validMetrics, legacy_activated: 248 },
    { male_count: 12, female_count: 8, legacy_total: 247 },
  ])("does not turn an invalid metrics payload into valid counts: %j", async (data) => {
    rpcMock.mockResolvedValue({ data, error: null })
    await expect(fetchMemberOverviewMetrics()).resolves.toBeNull()
  })

  it("reports a transport failure without logging raw account data", async () => {
    rpcMock.mockRejectedValue(new Error("private roster details"))
    await expect(fetchMemberOverviewMetrics()).resolves.toBeNull()
    expect(console.error).toHaveBeenCalledExactlyOnceWith("[member-overview] dashboard metrics request failed")
  })

  it("lets the authorization guard propagate instead of rendering zero counts", async () => {
    requireAdminMock.mockRejectedValue(new Error("AUTH_REQUIRED"))
    await expect(fetchMemberOverviewMetrics()).rejects.toThrow("AUTH_REQUIRED")
    expect(createClientMock).not.toHaveBeenCalled()
  })
})

describe("fetchLegacyMemberStatus", () => {
  it("requires the stronger role before reading names, numbers or login timestamps", async () => {
    requireSuperAdminMock.mockRejectedValue(new Error("SUPER_ADMIN_REQUIRED"))
    await expect(fetchLegacyMemberStatus()).rejects.toThrow("SUPER_ADMIN_REQUIRED")
    expect(createClientMock).not.toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("retains independent registration, approval and login values", async () => {
    rpcMock.mockResolvedValue({ data: validPage, error: null })
    await expect(fetchLegacyMemberStatus()).resolves.toEqual({
      items: [{
        fullName: validItem.full_name,
        memberNumber: "ZXS_001",
        memberId: validItem.member_id,
        registered: true,
        approved: false,
        hasLoggedIn: true,
        lastSignInAt: "2026-10-06T08:30:00Z",
        accountStatus: "active",
        activated: true,
      }],
      total: 1, page: 1, pageSize: 50, totalPages: 1, summary: { total: 247, activated: 14 },
    })
    expect(rpcMock).toHaveBeenCalledWith("admin_legacy_member_status", {
      p_search: null, p_filter: "all", p_page: 1, p_page_size: 50,
    })
  })

  it("preserves unknown values so a retired or unresolved account does not become never registered", async () => {
    rpcMock.mockResolvedValue({ data: {
      ...validPage,
      items: [{ ...validItem, member_id: null, registered: null, approved: null, has_logged_in: null,
        last_sign_in_at: null, account_status: "retired", activated: false }],
    }, error: null })
    const result = await fetchLegacyMemberStatus({ filter: "unverified" })
    expect(result.items[0]).toMatchObject({ memberId: null, registered: null, approved: null, hasLoggedIn: null, lastSignInAt: null, activated: false })
  })

  it("normalizes request limits and keeps authoritative database pagination", async () => {
    rpcMock.mockResolvedValue({ data: { ...validPage, total: 247, page: 3, page_size: 100, total_pages: 3 }, error: null })
    const result = await fetchLegacyMemberStatus({ search: `  ${"名".repeat(101)}  `, filter: "inactive", page: 200000, pageSize: 200 })
    expect(rpcMock).toHaveBeenCalledWith("admin_legacy_member_status", {
      p_search: "名".repeat(100), p_filter: "inactive", p_page: 100000, p_page_size: 100,
    })
    expect(result).toMatchObject({ total: 247, page: 3, pageSize: 100, totalPages: 3 })
  })

  it("shows a readable failure instead of treating a missing RPC as an empty roster", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "private roster details" } })
    await expect(fetchLegacyMemberStatus()).rejects.toThrow("无法读取老用户状态，请刷新后重试")
    expect(console.error).toHaveBeenCalledExactlyOnceWith("[member-overview] legacy status unavailable")
  })

  it.each([
    { ...validPage, summary: { total: 247, activated: 248 } },
    { ...validPage, total_pages: 0 },
    { ...validPage, items: [{ ...validItem, registered: "false" }] },
    { ...validPage, items: [{ ...validItem, has_logged_in: undefined }] },
    { ...validPage, items: [{ ...validItem, last_sign_in_at: "invalid timestamp" }] },
  ])("rejects malformed status data instead of displaying misleading symbols: %j", async (data) => {
    rpcMock.mockResolvedValue({ data, error: null })
    await expect(fetchLegacyMemberStatus()).rejects.toThrow("无法读取老用户状态，请刷新后重试")
  })

  it("accepts a valid empty filtered result without inventing rows", async () => {
    rpcMock.mockResolvedValue({ data: { ...validPage, items: [], total: 0, total_pages: 0 }, error: null })
    await expect(fetchLegacyMemberStatus({ search: "无匹配姓名" })).resolves.toMatchObject({
      items: [], total: 0, page: 1, totalPages: 0, summary: { total: 247, activated: 14 },
    })
    expect(console.error).not.toHaveBeenCalled()
  })
})
