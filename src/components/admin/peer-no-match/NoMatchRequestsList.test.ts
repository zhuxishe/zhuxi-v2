import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/admin/matching/avoidance-requests" }))
vi.mock("@/app/admin/login/actions", () => ({ logoutAdmin: async () => {} }))
import { NoMatchRequestsList } from "./NoMatchRequestsList"
import { AdminSidebar } from "@/components/admin/AdminSidebar"
import type { AdminPeerNoMatchRequest } from "@/lib/peer-no-match/admin-types"

const request: AdminPeerNoMatchRequest = {
  id: "40000000-0000-4000-8000-000000000001", roundId: "30000000-0000-4000-8000-000000000001", roundName: "周末交流活动", requesterId: "10000000-0000-4000-8000-000000000001", requesterName: "申请人甲",
  targetMemberId: "10000000-0000-4000-8000-000000000002", targetName: "成员乙", reason: "希望以后分开安排", status: "pending", version: 1,
  createdAt: "2026-11-23T06:00:00Z", updatedAt: "2026-11-23T06:00:00Z", processedAt: null, processedByName: null, internalNote: null, processingReason: null,
}
const action = async () => ({ success: true as const })

describe("no-match administration UI", () => {
  it("distinguishes recording a manual decision from enforcing a matching ban", () => {
    const html = renderToStaticMarkup(createElement(NoMatchRequestsList, { result: { status: "ready", data: { requests: [request], total: 1, page: 1, pageSize: 30 } }, status: "pending", action }))
    expect(html).toContain("不会自动禁止系统再次匹配")
    expect(html).toContain("保存只更新申请状态")
    expect(html).toContain("不会向双方发送自动通知")
    expect(html).toContain("不向对方展示")
    expect(html).toContain('href="/admin/matching/blacklist"')
    expect(html).toContain("记录人工处理结果")
  })
  it("shows operator, time and private reasons for completed requests with no reopening form", () => {
    const done = { ...request, status: "resolved" as const, version: 2, processedAt: "2026-11-23T07:00:00Z", processedByName: "管理员丙", internalNote: "已核对后续安排", processingReason: "双方互动情况已核对" }
    const html = renderToStaticMarkup(createElement(NoMatchRequestsList, { result: { status: "ready", data: { requests: [done], total: 1, page: 1, pageSize: 30 } }, status: "resolved", action }))
    expect(html).toContain("管理员丙")
    expect(html).toContain("2026-11-23 16:00")
    expect(html).toContain("已核对后续安排")
    expect(html).toContain("双方互动情况已核对")
    expect(html).not.toContain("保存处理结果")
  })
  it("keeps failed or unavailable reads separate from a genuinely empty queue", () => {
    for (const status of ["unavailable", "error"] as const) {
      const html = renderToStaticMarkup(createElement(NoMatchRequestsList, { result: { status }, status: "pending", action }))
      expect(html).not.toContain("当前状态下暂无申请")
      expect(html).not.toContain("保存处理结果")
    }
  })
  it("adds a discoverable shared desktop/mobile navigation entry", () => {
    const html = renderToStaticMarkup(createElement(AdminSidebar, { role: "admin" }))
    expect(html).toMatch(/<a[^>]*title="拒配申请"[^>]*aria-current="page"[^>]*href="\/admin\/matching\/avoidance-requests"/)
  })
})
