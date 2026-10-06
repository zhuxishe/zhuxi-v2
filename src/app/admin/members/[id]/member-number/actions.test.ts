import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), updateMemberSection: vi.fn(), revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/queries/member-center", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/queries/member-center")>(),
  updateMemberSection: mocks.updateMemberSection,
}))

import { updateMemberNumber } from "./actions"

const memberId = "a61d44af-2ea9-43d1-81d5-b3ba95794c9a"
const updatedAt = "2026-10-06T12:00:00.123456Z"

describe("administrator membership number changes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ role: "super_admin" })
    mocks.updateMemberSection.mockResolvedValue({ data: { member_number: "ZXS_248" }, updatedAt })
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("keeps ordinary admins out of the account mutation", async () => {
    mocks.requireAdmin.mockResolvedValue({ role: "admin" })
    expect(await updateMemberNumber(memberId, "ZXS_248", "修正会员编号", updatedAt)).toEqual({
      success: false, error: "仅超级管理员可修改会员编号",
    })
    expect(mocks.updateMemberSection).not.toHaveBeenCalled()
  })

  it("uses the page version for the canonical write and refreshes all number displays", async () => {
    expect(await updateMemberNumber(memberId, " zxs_0248 ", " 修正会员编号 ", updatedAt)).toEqual({
      success: true, memberNumber: "ZXS_248",
    })
    expect(mocks.updateMemberSection).toHaveBeenCalledWith({
      memberId, section: "account", payload: { member_number: "ZXS_248" }, reason: "修正会员编号", expectedUpdatedAt: updatedAt,
    })
    for (const path of ["/admin/members", `/admin/members/${memberId}`, "/admin/community/members", "/app", "/app/profile", "/app/profile/edit"]) {
      expect(mocks.revalidatePath).toHaveBeenCalledWith(path)
    }
  })

  it("requires a valid number and snapshot before allowing an update", async () => {
    expect((await updateMemberNumber(memberId, "ZXS_24", "修正会员编号", updatedAt)).success).toBe(false)
    expect((await updateMemberNumber(memberId, "ZXS_248", "修正会员编号", "")).success).toBe(false)
    expect(mocks.updateMemberSection).not.toHaveBeenCalled()
  })

  it("shows occupied, reserved and concurrent-update failures without refreshing on failure", async () => {
    for (const [code, message] of [
      ["MEMBER_NUMBER_TAKEN", "该会员编号已被其他成员使用"],
      ["MEMBER_NUMBER_RESERVED", "该会员编号已为其他名单成员预留，请更换编号。"],
      ["MEMBER_NUMBER_RETIRED", "该会员编号已停用，请使用其他编号"],
      ["MEMBER_MASTER_VERSION_CONFLICT", "资料已被其他管理员更新，请刷新后重试"],
    ]) {
      mocks.updateMemberSection.mockRejectedValueOnce(new Error(code))
      expect(await updateMemberNumber(memberId, "ZXS_248", "修正会员编号", updatedAt)).toEqual({ success: false, error: message })
    }
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
