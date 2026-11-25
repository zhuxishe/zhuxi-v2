import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import Page from "./page"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), fetch: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.auth }))
vi.mock("@/lib/queries/member-peer-score-directory", () => ({ fetchMemberPeerScoreDirectory: mocks.fetch }))
vi.mock("next/navigation", async (original) => ({
  ...await original<typeof import("next/navigation")>(),
  notFound: () => { throw new Error("not-found") },
}))

describe("合拍分数入口", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.fetch.mockResolvedValue({ status: "unavailable" })
  })

  it("blocks an ordinary administrator before querying the directory", async () => {
    mocks.auth.mockResolvedValue({ id: "admin", name: "管理员", role: "admin" })
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("not-found")
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it("loads the directory for a super administrator", async () => {
    mocks.auth.mockResolvedValue({ id: "admin", name: "管理员", role: "super_admin" })
    const params = { search: "测试会员" }
    expect(renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }))).toContain("合拍分数")
    expect(mocks.fetch).toHaveBeenCalledWith(params)
  })
})
