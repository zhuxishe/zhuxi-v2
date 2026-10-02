import { Children, isValidElement, type ReactElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), list: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/queries/pending-applications", () => ({ fetchPendingApplications: mocks.list }))
vi.mock("@/components/admin/pending-applications/PendingApplicationsQueue", () => ({ PendingApplicationsQueue: () => null }))
import PendingApplicationsPage from "./page"
import { PendingApplicationsQueue } from "@/components/admin/pending-applications/PendingApplicationsQueue"

function queueKey(node: ReactNode): string | null {
  if (!isValidElement<{ children?: ReactNode }>(node)) return null
  if (node.type === PendingApplicationsQueue) return node.key
  let key: string | null = null
  Children.forEach(node.props.children, (child) => { key ??= queueKey(child) })
  return key
}

describe("pending application result continuity", () => {
  beforeEach(() => {
    mocks.admin.mockResolvedValue({ name: "管理员", role: "admin" })
    mocks.list.mockResolvedValue({ items: [], total: 50, page: 1, pageSize: 50 })
  })

  it("preserves the result dialog when approving the last row shrinks the page count", async () => {
    const searchParams = Promise.resolve({ page: "2" })
    mocks.list.mockResolvedValueOnce({ items: [], total: 51, page: 2, pageSize: 50 })
    const before = await PendingApplicationsPage({ searchParams })
    const after = await PendingApplicationsPage({ searchParams })
    expect(queueKey(before as ReactElement)).toBe(":2")
    expect(queueKey(after as ReactElement)).toBe(queueKey(before as ReactElement))
  })

  it("clears the selection when the user deliberately changes page or search", async () => {
    const original = await PendingApplicationsPage({ searchParams: Promise.resolve({ page: "2" }) })
    const newPage = await PendingApplicationsPage({ searchParams: Promise.resolve({ page: "1" }) })
    const searched = await PendingApplicationsPage({ searchParams: Promise.resolve({ page: "2", search: "东京" }) })
    expect(queueKey(newPage)).not.toBe(queueKey(original))
    expect(queueKey(searched)).not.toBe(queueKey(original))
  })
})
