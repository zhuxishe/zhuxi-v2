import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), admin: vi.fn(), getUser: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, auth: { getUser: mocks.getUser } }) }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
import { deleteRound } from "./delete-actions"

const id = "14a170d2-97c0-4fc2-881a-2f9e2afc231e"
const account = "admin@example.test"
const remove = (roundId = id, name = "活动", revision = 1) => deleteRound(roundId, name, revision, "执行人", "重复创建", account)

describe("round deletion", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.admin.mockResolvedValue({ id: "admin", role: "super_admin" })
    mocks.rpc.mockResolvedValue({ data: true, error: null })
    mocks.getUser.mockResolvedValue({ data: { user: { email: account } }, error: null })
  })

  it("rejects ordinary administrators before accessing the database", async () => {
    mocks.admin.mockResolvedValue({ role: "admin" })
    expect((await remove()).error).toContain("仅超级管理员")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("requires authorization even when the input is invalid", async () => {
    mocks.admin.mockRejectedValue(new Error("unauthorized"))
    await expect(remove("bad-id", "", -1)).rejects.toThrow("unauthorized")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ["bad-id", "活动", 1], [id, "", 1], [id, "活动", -1], [id, "活动", 1.5],
  ])("rejects malformed confirmation input", async (roundId, name, revision) => {
    expect((await remove(roundId as string, name as string, revision as number)).error).toContain("确认活动名称")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("sends the exact confirmation and revision and refreshes all affected entry points", async () => {
    expect(await deleteRound(id, "秋季迎新派对（新）", 3, " 执行人 ", " 重复创建 ", account)).toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledWith("admin_delete_match_round", { p_round_id: id, p_confirm_name: "秋季迎新派对（新）", p_expected_revision: 3, p_operator_name: "执行人", p_reason: "重复创建" })
    for (const path of ["/admin/matching", "/admin/activity-reviews", "/app", "/app/matching", "/app/matches", "/app/notifications"]) {
      expect(mocks.revalidate).toHaveBeenCalledWith(path)
    }
  })

  it.each([
    ["ROUND_DELETE_CONFIRMATION", "名称不一致"],
    ["ROUND_DELETE_CHANGED", "其他管理员修改"],
    ["ROUND_DELETE_HAS_MATCHES", "已有匹配记录"],
    ["ROUND_DELETE_HAS_FEEDBACK", "已有评分或举报"],
    ["ROUND_DELETE_FORBIDDEN", "仅超级管理员"],
    ["ROUND_NOT_FOUND", "活动不存在"],
    ["ROUND_DELETE_AUDIT_REQUIRED", "填写执行人姓名和删除原因"],
    ["ROUND_DELETE_OPERATOR_INVALID", "执行人的姓名"],
    ["ROUND_DELETE_REASON_INVALID", "删除原因"],
  ])("explains the database rejection %s without reporting deletion", async (code, text) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: code } })
    expect((await remove()).error).toContain(text)
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("does not report success if the deletion could not be confirmed", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    expect((await remove()).error).toContain("未能确认")
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it.each([
    [" ", "重复创建", "姓名"], ["名".repeat(81), "重复创建", "姓名"],
    ["执行人", " ", "删除原因"], ["执行人", "删", "删除原因"], ["执行人", "原".repeat(501), "删除原因"],
  ])("rejects missing or excessive audit details", async (name, reason, message) => {
    expect((await deleteRound(id, "活动", 1, name, reason, account)).error).toContain(message)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects a displayed account that differs from the actual session", async () => {
    expect((await deleteRound(id, "活动", 1, "执行人", "重复创建", "other@example.test")).error).toContain("重新核对管理员账号")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("fails closed when the current login cannot be verified", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } })
    expect((await remove()).error).toContain("无法确认")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
