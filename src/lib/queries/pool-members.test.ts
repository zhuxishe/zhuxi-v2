import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ admin: vi.fn(), preview: vi.fn(), db: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/matching/adjustment-service", () => ({ fetchMatchingAdjustmentPreview: mocks.preview }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.db }))
import { fetchPoolMembers } from "./pool-members"
const summary = { submitted_count: 3, eligible_count: 1, excluded_count: 2, exclusion_summary: [], has_existing_multi_pool: false, base_revision: "revision", available_members: [{ id: "offline-import", name: "合法导入" }], excluded_members: [{ id: "withdrawn", reasons: ["cancelled"] }, { id: "inactive", reasons: ["account_unavailable"] }] }
beforeEach(() => { vi.resetAllMocks(); mocks.admin.mockResolvedValue({ id: "admin" }); mocks.preview.mockResolvedValue(summary) })
it("shows the exact authoritative pool scope including excluded records and legitimate import exceptions", async () => {
  const read = vi.fn().mockResolvedValue({ data: [
    { id: "offline-import", member_identity: { full_name: "合法导入" } },
    { id: "withdrawn", member_identity: { full_name: "已退报名" } },
    { id: "inactive", member_identity: { full_name: "停用账号" } },
  ], error: null })
  mocks.db.mockReturnValue({ from: () => ({ select: () => ({ in: read }) }) })
  const result = await fetchPoolMembers("session")
  expect(read).toHaveBeenCalledWith("id", ["offline-import", "withdrawn", "inactive"])
  expect(result.map(({ id, eligible, exclusionReasons }) => ({ id, eligible, exclusionReasons }))).toEqual([
    { id: "offline-import", eligible: true, exclusionReasons: [] },
    { id: "withdrawn", eligible: false, exclusionReasons: ["cancelled"] },
    { id: "inactive", eligible: false, exclusionReasons: ["account_unavailable"] },
  ])
})
it("does not read member information when preview authorization fails", async () => {
  mocks.admin.mockRejectedValue(new Error("denied"))
  await expect(fetchPoolMembers("session")).rejects.toThrow("denied")
  expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.preview).not.toHaveBeenCalled()
})
it("uses the page's already captured preview without selecting another pool", async () => {
  mocks.db.mockReturnValue({ from: () => ({ select: () => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) })
  await fetchPoolMembers("session", summary)
  expect(mocks.preview).not.toHaveBeenCalled()
})
