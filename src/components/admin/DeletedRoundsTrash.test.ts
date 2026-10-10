import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { DeletedRoundsTrash } from "./DeletedRoundsTrash"
import type { DeletedRoundPage } from "@/lib/queries/deleted-rounds"

const data: DeletedRoundPage = {
  items: [{ id: "deleted-round", roundName: "秋季迎新派对（重复）", purpose: "registration", activityStart: "2026-10-10", activityEnd: "2026-10-11", deletedAt: "2026-10-10T10:15:00Z", deletedAdminEmail: "original-admin@example.test", executorName: "执行人姓名", reason: "重复创建，保留原活动", legacy: false }],
  total: 1, page: 1, pageSize: 10, totalPages: 1,
}
const render = (props: Partial<Parameters<typeof DeletedRoundsTrash>[0]> = {}) => renderToStaticMarkup(createElement(DeletedRoundsTrash, { data, canView: true, ...props }))

describe("matching activities trash", () => {
  it("is collapsed by default and shows read-only deletion details with Japan time", () => {
    const html = render()
    expect(html).toContain("垃圾箱")
    expect(html).toContain("1 条")
    expect(html).not.toMatch(/<details[^>]*\sopen/)
    expect(html).toContain("秋季迎新派对（重复）")
    expect(html).toContain("固定时间活动报名")
    expect(html).toContain("2026-10-10 — 2026-10-11")
    expect(html).toContain("2026-10-10 19:15")
    expect(html).toContain("original-admin@example.test")
    expect(html).toContain("执行人姓名")
    expect(html).toContain("重复创建，保留原活动")
    expect(html).not.toContain("/rounds/deleted-round")
    expect(html).not.toContain("<button")
    expect(html).not.toContain("<form")
  })

  it("does not reveal a supplied record to an ordinary administrator", () => {
    const html = render({ canView: false })
    expect(html).toContain("仅超级管理员可查看")
    expect(html).not.toContain("秋季迎新派对")
    expect(html).not.toContain("original-admin@example.test")
    expect(html).not.toContain("1 条")
  })

  it("labels legacy records explicitly and does not invent missing execution metadata", () => {
    const html = render({ data: { ...data, items: [{ ...data.items[0], deletedAdminEmail: null, executorName: null, reason: null, legacy: true }] } })
    expect(html).toContain("旧版删除记录，未记录执行人姓名／原因")
    expect(html).toContain("旧版未记录")
    expect(html).not.toContain("original-admin@example.test")
    expect(html).not.toContain("执行人姓名</dd>")
  })

  it("preserves the expanded trash when navigating between bounded pages", () => {
    const first = render({ expanded: true, data: { ...data, total: 23, totalPages: 3 } })
    expect(first).toMatch(/<details[^>]*\sopen=""/)
    expect(first).toContain('href="/admin/matching?deletedPage=2"')
    expect(first).not.toContain("上一页")
    const second = render({ expanded: true, data: { ...data, total: 23, totalPages: 3, page: 2 } })
    expect(second).toContain('href="/admin/matching?deletedPage=1"')
    expect(second).toContain('href="/admin/matching?deletedPage=3"')
    expect(second).toContain("第 2／3 页")
  })

  it("renders a truthful empty state and a separate unavailable state", () => {
    const empty = render({ data: { ...data, items: [], total: 0 } })
    expect(empty).toContain("暂无已删除活动")
    const error = render({ data: null, error: true })
    expect(error).toContain('role="alert"')
    expect(error).toContain("暂时无法加载删除记录")
    expect(error).not.toContain("0 条")
    expect(error).not.toContain("暂无已删除活动")
  })

  it("escapes saved names and reasons as text", () => {
    const html = render({ data: { ...data, items: [{ ...data.items[0], roundName: "<script>activity</script>", executorName: "<img src=x>", reason: "<script>reason</script>" }] } })
    expect(html).toContain("&lt;script&gt;activity&lt;/script&gt;")
    expect(html).toContain("&lt;img src=x&gt;")
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("<img src=x>")
  })
})
