import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ pathname: "/admin/peer-scores" }))
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }))
vi.mock("@/app/admin/login/actions", () => ({ logoutAdmin: async () => {} }))
import { AdminSidebar } from "@/components/admin/AdminSidebar"

describe("peer score navigation", () => {
  beforeEach(() => { mocks.pathname = "/admin/peer-scores" })
  it("appears after activity reviews for super administrators", () => {
    const html = renderToStaticMarkup(createElement(AdminSidebar, { role: "super_admin" }))
    expect(html.indexOf('href="/admin/peer-scores"')).toBeGreaterThan(html.indexOf('href="/admin/activity-reviews"'))
    expect(html.indexOf('href="/admin/peer-scores"')).toBeLessThan(html.indexOf('href="/admin/matching/cancellations"'))
    expect(html).toMatch(/<a[^>]*title="合拍分数"[^>]*aria-current="page"[^>]*href="\/admin\/peer-scores"/)
  })
  it("hides the score section from ordinary administrators", () => {
    const html = renderToStaticMarkup(createElement(AdminSidebar, { role: "admin" }))
    expect(html).not.toContain('href="/admin/peer-scores"')
    expect(html).toContain('href="/admin/activity-reviews"')
  })
  it("keeps the score section selected on member detail pages", () => {
    mocks.pathname = "/admin/peer-scores/member-id"
    const html = renderToStaticMarkup(createElement(AdminSidebar, { role: "super_admin" }))
    expect(html).toMatch(/<a[^>]*title="合拍分数"[^>]*aria-current="page"[^>]*href="\/admin\/peer-scores"/)
  })
})
