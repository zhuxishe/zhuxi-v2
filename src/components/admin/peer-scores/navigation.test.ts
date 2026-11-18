import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ pathname: "/admin/peer-scores" }))
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }))
vi.mock("@/app/admin/login/actions", () => ({ logoutAdmin: async () => {} }))
import { AdminSidebar } from "@/components/admin/AdminSidebar"

describe("peer score navigation", () => {
  beforeEach(() => { mocks.pathname = "/admin/peer-scores" })
  it.each(["admin", "super_admin"] as const)("appears after activity reviews in the shared desktop/mobile navigation for %s", (role) => {
    const html = renderToStaticMarkup(createElement(AdminSidebar, { role }))
    expect(html.indexOf('href="/admin/peer-scores"')).toBeGreaterThan(html.indexOf('href="/admin/activity-reviews"'))
    expect(html.indexOf('href="/admin/peer-scores"')).toBeLessThan(html.indexOf('href="/admin/matching/cancellations"'))
    expect(html).toMatch(/<a[^>]*title="合拍分数"[^>]*aria-current="page"[^>]*href="\/admin\/peer-scores"/)
  })
  it("keeps the score section selected on member detail pages", () => {
    mocks.pathname = "/admin/peer-scores/member-id"
    const html = renderToStaticMarkup(createElement(AdminSidebar, { role: "admin" }))
    expect(html).toMatch(/<a[^>]*title="合拍分数"[^>]*aria-current="page"[^>]*href="\/admin\/peer-scores"/)
  })
})
