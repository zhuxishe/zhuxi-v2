import { Children, isValidElement, type ReactElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), list: vi.fn(), ignored: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/queries/pending-applications", () => ({ fetchPendingApplications: mocks.list, fetchIgnoredApplications: mocks.ignored }))
vi.mock("@/components/admin/pending-applications/PendingApplicationsQueue", () => ({ PendingApplicationsQueue: () => null }))
vi.mock("@/components/admin/pending-applications/IgnoredApplicationsList", () => ({ IgnoredApplicationsList: () => null }))
import PendingApplicationsPage from "./page"
import { PendingApplicationsQueue } from "@/components/admin/pending-applications/PendingApplicationsQueue"
import { IgnoredApplicationsList } from "@/components/admin/pending-applications/IgnoredApplicationsList"

function queueKey(node: ReactNode): string | null {
  if (!isValidElement<{ children?: ReactNode }>(node)) return null
  if (node.type === PendingApplicationsQueue) return node.key
  let key: string | null = null
  Children.forEach(node.props.children, (child) => { key ??= queueKey(child) })
  return key
}

function ignoredList(node: ReactNode): ReactElement<{ search: string; pendingPage: number; applications: unknown }> | null {
  if (!isValidElement<{ children?: ReactNode }>(node)) return null
  if (node.type === IgnoredApplicationsList) return node as ReactElement<{ search: string; pendingPage: number; applications: unknown }>
  let result: ReturnType<typeof ignoredList> = null
  Children.forEach(node.props.children, (child) => { result ??= ignoredList(child) })
  return result
}

describe("pending application result continuity", () => {
  beforeEach(() => {
    mocks.admin.mockResolvedValue({ name: "管理员", role: "admin" })
    mocks.list.mockResolvedValue({ items: [], total: 50, page: 1, pageSize: 50 })
    mocks.ignored.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 })
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

  it("loads ignored applications with independent pagination while preserving the pending selection", async () => {
    const original = await PendingApplicationsPage({ searchParams: Promise.resolve({ page: "2", search: " 东京 " }) })
    const ignoredPage = { items: [], total: 70, page: 2, pageSize: 50 }
    mocks.ignored.mockResolvedValueOnce(ignoredPage)
    const next = await PendingApplicationsPage({ searchParams: Promise.resolve({ page: "2", ignoredPage: "2", search: " 东京 " }) })
    expect(mocks.list).toHaveBeenLastCalledWith({ search: "东京", page: 2 })
    expect(mocks.ignored).toHaveBeenLastCalledWith({ search: "东京", page: 2 })
    expect(queueKey(next)).toBe(queueKey(original))
    expect(ignoredList(next)?.props).toMatchObject({ applications: ignoredPage, search: "东京", pendingPage: 2 })
    expect(ignoredList(next)?.key).not.toBe(ignoredList(original)?.key)
  })
})
