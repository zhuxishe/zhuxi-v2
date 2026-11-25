import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ auth: vi.fn(), fetch: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.auth }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/queries/member-peer-score-detail", async original => ({ ...await original<typeof import("@/lib/queries/member-peer-score-detail")>(), fetchMemberPeerScoreDetail: mocks.fetch }))
vi.mock("next/navigation", async original => ({ ...await original<typeof import("next/navigation")>(), notFound: () => { throw new Error("not-found") } }))
import Page from "./page"
import { normalizeMemberPeerScoreDetail } from "@/lib/queries/member-peer-score-detail"
import { detailMemberId, detailRoundIds, memberPeerScoreDetailFixture } from "@/lib/queries/__fixtures__/member-peer-score-detail"

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ id: "admin", name: "管理员", role: "super_admin" })
  mocks.fetch.mockResolvedValue({ status: "ready", data: normalizeMemberPeerScoreDetail(memberPeerScoreDetailFixture(), detailMemberId) })
})
const props = (query = {}) => ({ params: Promise.resolve({ memberId: detailMemberId }), searchParams: Promise.resolve(query) })

describe("administrator peer-score member route", () => {
  it("renders the member detail using validated activity and validity filters", async () => {
    const html = renderToStaticMarkup(await Page(props({ validity: "all", roundId: detailRoundIds[0], page: "1" })))
    expect(html).toContain("成员合拍分数详情")
    expect(html).toContain("林青")
    expect(mocks.fetch).toHaveBeenCalledWith(detailMemberId, { validity: "all", roundId: detailRoundIds[0], page: 1, pageSize: 20 })
  })
  it("does not read data before administrator authorization completes", async () => {
    mocks.auth.mockRejectedValueOnce(new Error("denied"))
    await expect(Page(props())).rejects.toThrow("denied")
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it("returns not found before reading data for an ordinary administrator", async () => {
    mocks.auth.mockResolvedValueOnce({ id: "admin", name: "管理员", role: "admin" })
    await expect(Page(props())).rejects.toThrow("not-found")
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it("returns not found for a malformed ID or a member outside the directory scope", async () => {
    await expect(Page({ ...props(), params: Promise.resolve({ memberId: "invalid" }) })).rejects.toThrow("not-found")
    expect(mocks.fetch).not.toHaveBeenCalled()
    mocks.fetch.mockResolvedValueOnce({ status: "not_found" })
    await expect(Page(props())).rejects.toThrow("not-found")
  })
  it("renders a recoverable error rather than saying there are no reviews when the query fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.fetch.mockRejectedValueOnce(new Error("offline"))
    const html = renderToStaticMarkup(await Page(props({ validity: "all", roundId: detailRoundIds[0] })))
    expect(html).toContain("详情暂时读取失败")
    expect(html).toContain("不表示该成员没有评分")
    expect(html).not.toContain("该成员暂无有效单项评价")
    expect(html).toContain(`validity=all&amp;roundId=${detailRoundIds[0]}`)
    log.mockRestore()
  })
  it("distinguishes an unapplied database feature from an empty score", async () => {
    mocks.fetch.mockResolvedValueOnce({ status: "unavailable" })
    const html = renderToStaticMarkup(await Page(props()))
    expect(html).toContain("详情功能尚未配置")
    expect(html).not.toContain("暂无有效评分")
  })
  it("recovers an out-of-range page with a server query while preserving the activity filter", async () => {
    const data = normalizeMemberPeerScoreDetail(memberPeerScoreDetailFixture(), detailMemberId)
    mocks.fetch.mockResolvedValueOnce({ status: "ready", data: { ...data, reviews: [], filters: { ...data.filters, page: 99 } } })
    await Page(props({ page: "99", validity: "all", roundId: detailRoundIds[0] }))
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, detailMemberId, { validity: "all", roundId: detailRoundIds[0], page: 1, pageSize: 20 })
  })
})
