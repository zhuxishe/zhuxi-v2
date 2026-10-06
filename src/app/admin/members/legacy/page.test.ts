import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), list: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/queries/member-overview", () => ({ fetchLegacyMemberStatus: mocks.list }))
vi.mock("@/components/admin/AdminTopBar", () => ({ AdminTopBar: () => null }))
vi.mock("@/components/shared/Pagination", () => ({ Pagination: () => null }))
import LegacyMembersPage from "./page"

describe("legacy member status visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.admin.mockResolvedValue({ role: "super_admin" })
    mocks.list.mockResolvedValue({
      items: [], total: 0, page: 1, pageSize: 50, totalPages: 0,
      summary: { total: 247, activated: 0 },
    })
  })

  afterEach(() => { vi.restoreAllMocks() })

  it("does not fetch private roster or sign-in details for ordinary administrators", async () => {
    mocks.admin.mockResolvedValue({ role: "admin" })
    const html = renderToStaticMarkup(await LegacyMembersPage({ searchParams: Promise.resolve({}) }))
    expect(mocks.list).not.toHaveBeenCalled()
    expect(html).toContain("仅超级管理员可查看")
  })

  it("shows a read failure instead of a misleading zero activation count", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.list.mockRejectedValue(new Error("temporary database failure"))
    const html = renderToStaticMarkup(await LegacyMembersPage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain("老用户状态读取失败")
    expect(html).not.toContain("已激活")
    expect(html).not.toContain("temporary database failure")
  })

  it("keeps an unverified identity distinct from confirmed unregistered or failed review", async () => {
    mocks.list.mockResolvedValue({
      items: [{
        fullName: "待核实玩家", memberNumber: "ZXS_001", memberId: null,
        registered: null, approved: null, hasLoggedIn: null, lastSignInAt: null,
        accountStatus: "unverified", activated: false,
      }],
      total: 1, page: 1, pageSize: 50, totalPages: 1,
      summary: { total: 247, activated: 0 },
    })
    const html = renderToStaticMarkup(await LegacyMembersPage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('aria-label="尚未确认账号关联"')
    expect(html).toContain('aria-label="待审核或无审核记录"')
    expect(html).toContain('aria-label="无可确认的登录记录"')
    expect(html).not.toContain('aria-label="未注册"')
    expect(html).not.toContain('aria-label="审核未通过"')
  })
})
