import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { IgnoredApplicationItem, PendingApplicationItem } from "@/types/pending-applications"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/app/admin/members/pending/actions", () => ({ ignorePendingApplication: vi.fn(), restoreIgnoredApplication: vi.fn() }))

import { PendingApplicationRow } from "./PendingApplicationRow"
import { IgnoredApplicationsList } from "./IgnoredApplicationsList"

const application: PendingApplicationItem = {
  id: "00000000-0000-4000-8000-000000000001", fullName: "测试申请人", nickname: null,
  schoolName: "测试学校", submittedAt: "2026-10-23T00:00:00Z", createdAt: "2026-10-23T00:00:00Z",
  updatedAt: "2026-10-23T00:00:00Z", blockReason: "请核实注册资料",
}

describe("pending application queue presentation", () => {
  it("allows ignoring incomplete applications without enabling their approval", () => {
    const html = renderToStaticMarkup(createElement(PendingApplicationRow, {
      item: application, selected: false, onSelect: vi.fn(), onApprove: vi.fn(), onIgnore: vi.fn(),
    }))
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []
    expect(buttons.find((button) => button.includes("快速通过"))).toMatch(/\sdisabled(?:=|\s|>)/)
    expect(buttons.find((button) => button.includes("忽略"))).not.toMatch(/\sdisabled(?:=|\s|>)/)
    expect(html).toContain("请核实注册资料")
  })

  it("shows audit details and restores the independent ignored page without changing the pending page", () => {
    const ignored: IgnoredApplicationItem = {
      ...application, ignoredAt: "2026-10-23T01:30:00Z", ignoredByName: "审核管理员", ignoreReason: "非目标人群，暂不跟进。",
    }
    const html = renderToStaticMarkup(createElement(IgnoredApplicationsList, {
      applications: { items: [ignored], total: 51, page: 1, pageSize: 50 }, search: "Tokyo", pendingPage: 3,
    }))
    expect(html).toContain('aria-labelledby="ignored-applications-title"')
    expect(html).toContain("审核管理员")
    expect(html).toContain("2026-10-23 10:30")
    expect(html).toContain("非目标人群，暂不跟进。")
    expect(html).toContain("恢复待处理")
    expect(html).toContain('href="/admin/members/pending?search=Tokyo&amp;page=3&amp;ignoredPage=2#ignored-applications"')
  })
})
