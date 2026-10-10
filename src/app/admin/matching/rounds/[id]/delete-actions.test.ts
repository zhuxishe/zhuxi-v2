import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), admin: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
import { deleteRound } from "./delete-actions"

const id = "14a170d2-97c0-4fc2-881a-2f9e2afc231e"

describe("round deletion", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.admin.mockResolvedValue({ id: "admin", role: "super_admin" })
    mocks.rpc.mockResolvedValue({ data: true, error: null })
  })

  it("rejects ordinary administrators before accessing the database", async () => {
    mocks.admin.mockResolvedValue({ role: "admin" })
    expect((await deleteRound(id, "活动", 1)).error).toContain("仅超级管理员")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("requires authorization even when the input is invalid", async () => {
    mocks.admin.mockRejectedValue(new Error("unauthorized"))
    await expect(deleteRound("bad-id", "", -1)).rejects.toThrow("unauthorized")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ["bad-id", "活动", 1], [id, "", 1], [id, "活动", -1], [id, "活动", 1.5],
  ])("rejects malformed confirmation input", async (roundId, name, revision) => {
    expect((await deleteRound(roundId as string, name as string, revision as number)).error).toContain("确认活动名称")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("sends the exact confirmation and revision and refreshes all affected entry points", async () => {
    expect(await deleteRound(id, "秋季迎新派对（新）", 3)).toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledWith("admin_delete_match_round", { p_round_id: id, p_confirm_name: "秋季迎新派对（新）", p_expected_revision: 3 })
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
  ])("explains the database rejection %s without reporting deletion", async (code, text) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: code } })
    expect((await deleteRound(id, "活动", 1)).error).toContain(text)
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("does not report success if the deletion could not be confirmed", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    expect((await deleteRound(id, "活动", 1)).error).toContain("未能确认")
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})
