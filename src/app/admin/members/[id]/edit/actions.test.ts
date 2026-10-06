import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), updateMemberSection: vi.fn(), revalidatePath: vi.fn(),
}))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/queries/member-center", () => ({
  updateMemberSection: mocks.updateMemberSection,
  memberCenterErrorMessage: () => "保存失败",
}))

import { updateMemberIdentity } from "./actions"

describe("admin identity birthday compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ id: "admin-id" })
    mocks.updateMemberSection.mockResolvedValue({})
  })

  it("lets the database derive age for a birthday and prevents original-age tampering", async () => {
    expect(await updateMemberIdentity("member", {
      birth_date: "2000-02-29", age_range: "18-20", legacy_age_range: "forged",
    }, "本人申请更正")).toEqual({ success: true })
    expect(mocks.requireAdmin).toHaveBeenCalledOnce()
    expect(mocks.updateMemberSection).toHaveBeenCalledWith({
      memberId: "member", section: "identity", payload: { birth_date: "2000-02-29" }, reason: "本人申请更正",
    })
  })

  it("preserves old profiles without forcing new required registration fields", async () => {
    expect(await updateMemberIdentity("member", {
      age_range: "20-24", school_name: null, degree_level: null,
    }, "历史资料更正")).toEqual({ success: true })
    expect(mocks.updateMemberSection).toHaveBeenCalledWith(expect.objectContaining({
      payload: { age_range: "20-24", school_name: null, degree_level: null },
    }))
  })

  it("rejects invalid dates before calling the update RPC", async () => {
    for (const birth_date of ["2001-02-29", "2000-2-29", "2999-01-01", "1899-12-31"]) {
      expect((await updateMemberIdentity("member", { birth_date }, "本人申请更正")).error).toContain("有效生日")
    }
    expect(mocks.updateMemberSection).not.toHaveBeenCalled()
  })
})
