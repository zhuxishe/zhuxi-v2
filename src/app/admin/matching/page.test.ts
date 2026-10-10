import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), rounds: vi.fn(), sessions: vi.fn(), deleted: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/queries/rounds", () => ({ fetchRounds: mocks.rounds }))
vi.mock("@/lib/queries/matching", () => ({ fetchMatchSessions: mocks.sessions }))
vi.mock("@/lib/queries/deleted-rounds", () => ({ fetchDeletedRounds: mocks.deleted }))
vi.mock("@/components/admin/AdminTopBar", () => ({ AdminTopBar: () => null }))
vi.mock("@/components/admin/MatchingWorkbench", () => ({ MatchingWorkbench: () => "正常匹配管理" }))
import MatchingPage from "./page"

describe("matching page trash visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.admin.mockResolvedValue({ role: "super_admin" })
    mocks.rounds.mockResolvedValue([]); mocks.sessions.mockResolvedValue([])
    mocks.deleted.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 })
  })
  afterEach(() => { vi.restoreAllMocks() })

  it("does not query deletion metadata for ordinary administrators", async () => {
    mocks.admin.mockResolvedValue({ role: "admin" })
    const html = renderToStaticMarkup(await MatchingPage({ searchParams: Promise.resolve({ deletedPage: "2" }) }))
    expect(mocks.deleted).not.toHaveBeenCalled()
    expect(html).toContain("正常匹配管理")
    expect(html).toContain("仅超级管理员可查看")
  })

  it("loads the selected trash page and keeps it expanded for a super administrator", async () => {
    const html = renderToStaticMarkup(await MatchingPage({ searchParams: Promise.resolve({ deletedPage: "2" }) }))
    expect(mocks.deleted).toHaveBeenCalledWith("2")
    expect(html).toMatch(/<details[^>]*\sopen=""/)
    expect(html).toContain("正常匹配管理")
  })

  it("keeps normal matching controls available if only the trash query fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.deleted.mockRejectedValue(new Error("private database failure"))
    const html = renderToStaticMarkup(await MatchingPage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain("正常匹配管理")
    expect(html).toContain("暂时无法加载删除记录")
    expect(html).not.toContain("private database failure")
    expect(html).not.toContain("0 条")
  })
})
