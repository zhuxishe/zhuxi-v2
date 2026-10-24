import { Children, isValidElement, type ComponentProps, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), session: vi.fn(), relationships: vi.fn(), preview: vi.fn(), records: vi.fn(), snapshot: vi.fn(), poolMembers: vi.fn(), metadata: vi.fn(), from: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/queries/matching", () => ({ fetchMatchSession: mocks.session, fetchPairRelationships: mocks.relationships }))
vi.mock("@/lib/matching/adjustment-service", () => ({ fetchMatchingAdjustmentPreview: mocks.preview, fetchMatchingAdjustmentRecords: mocks.records }))
vi.mock("@/lib/matching/input-snapshot-reader", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/matching/input-snapshot-reader")>(), fetchMatchingInputSnapshot: mocks.snapshot }))
vi.mock("@/lib/queries/pool-members", () => ({ fetchPoolMembers: mocks.poolMembers }))
vi.mock("@/lib/matching/import-metadata-column", () => ({ supportsImportMetadataColumn: mocks.metadata }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }))
vi.mock("@/components/admin/AdminTopBar", () => ({ AdminTopBar: () => null }))
vi.mock("@/components/admin/MatchSessionView", () => ({ MatchSessionView: () => null }))
import MatchSessionDetailPage from "./page"
import { MatchSessionView } from "@/components/admin/MatchSessionView"

type ViewProps = ComponentProps<typeof MatchSessionView>
function viewProps(node: ReactNode): ViewProps | null {
  if (!isValidElement<{ children?: ReactNode }>(node)) return null
  if (node.type === MatchSessionView) return node.props as ViewProps
  let result: ViewProps | null = null
  Children.forEach(node.props.children, (child) => { result ??= viewProps(child) })
  return result
}
const savedSession = { id: "session", round_id: "round", session_name: "测试方案", status: "draft", results_ready: true, publication_version: 1, total_candidates: 2, total_matched: 0, total_unmatched: 2 }
const poolSummary = { submitted_count: 2, eligible_count: 2, excluded_count: 0, exclusion_summary: [], has_existing_multi_pool: false, available_members: [{ id: "A", name: "成员A" }, { id: "B", name: "成员B" }], excluded_members: [], base_revision: "current-revision" }
const loadPage = async () => viewProps(await MatchSessionDetailPage({ params: Promise.resolve({ id: "session" }) }))!

beforeEach(() => {
  vi.clearAllMocks()
  mocks.admin.mockResolvedValue({ id: "admin", role: "super_admin" })
  mocks.session.mockResolvedValue({ session: savedSession, results: [] })
  mocks.relationships.mockResolvedValue([])
  mocks.preview.mockResolvedValue(poolSummary)
  mocks.records.mockResolvedValue([])
  mocks.snapshot.mockResolvedValue(null)
  mocks.poolMembers.mockResolvedValue([{ id: "A", name: "成员A", memberData: null }])
  mocks.metadata.mockResolvedValue(false)
  mocks.from.mockImplementation(() => ({ select: () => ({ eq: () => Promise.resolve({ data: [] }) }) }))
})

describe("matching detail adjustment-preview routing", () => {
  it("does not request draft-only previews or invent pool counts for a published session", async () => {
    mocks.session.mockResolvedValue({ session: { ...savedSession, status: "confirmed" }, results: [] })
    const props = await loadPage()
    expect(mocks.preview).not.toHaveBeenCalled()
    expect(mocks.poolMembers).not.toHaveBeenCalled()
    expect(props.session.status).toBe("confirmed")
    expect(props.poolSummary).toBeUndefined()
    expect(props.poolMembers).toEqual([])
    expect(props.allMemberOptions).toEqual([])
    expect(mocks.records).toHaveBeenCalledWith("session")
  })

  it("waits for complete results before asking for qualification previews", async () => {
    mocks.session.mockResolvedValue({ session: { ...savedSession, results_ready: false }, results: [] })
    const props = await loadPage()
    expect(mocks.preview).not.toHaveBeenCalled()
    expect(mocks.poolMembers).not.toHaveBeenCalled()
    expect(props.session.results_ready).toBe(false)
    expect(props.poolSummary).toBeUndefined()
  })

  it("uses the current qualified preview for a ready draft and retains existing operation candidates", async () => {
    const props = await loadPage()
    expect(mocks.preview.mock.calls).toEqual([["session", "manual"], ["session", "pool"]])
    expect(mocks.poolMembers).toHaveBeenCalledWith("session", poolSummary)
    expect(props.poolSummary).toMatchObject({ submitted_count: 2, eligible_count: 2 })
    expect(props.allMemberOptions).toEqual(poolSummary.available_members)
  })

  it("represents an actual pool-preview failure as unavailable while preserving the manual preview", async () => {
    mocks.preview.mockImplementation((_id: string, kind: string) => kind === "pool" ? Promise.reject(new Error("read failed")) : Promise.resolve(poolSummary))
    const props = await loadPage()
    expect(mocks.preview).toHaveBeenCalledTimes(2)
    expect(mocks.poolMembers).not.toHaveBeenCalled()
    expect(props.poolSummary).toBeUndefined()
    expect(props.allMemberOptions).toEqual(poolSummary.available_members)
  })

  it("resumes normal preview reads after withdrawal restores a ready draft", async () => {
    mocks.session.mockResolvedValueOnce({ session: { ...savedSession, status: "confirmed" }, results: [] })
    await loadPage()
    expect(mocks.preview).not.toHaveBeenCalled()
    const props = await loadPage()
    expect(mocks.preview.mock.calls).toEqual([["session", "manual"], ["session", "pool"]])
    expect(props.poolSummary?.eligible_count).toBe(2)
  })

  it("keeps legacy sessions without a round read-only without qualification preview requests", async () => {
    mocks.session.mockResolvedValue({ session: { ...savedSession, round_id: null }, results: [] })
    const props = await loadPage()
    expect(mocks.preview).not.toHaveBeenCalled()
    expect(mocks.records).not.toHaveBeenCalled()
    expect(props.readOnly).toBe(true)
  })
})
