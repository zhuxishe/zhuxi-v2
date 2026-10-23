import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MemberCompositeScoreValues } from "@/types/member-composite-scores"

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), updateScores: vi.fn(), updateMemberSection: vi.fn(), revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/queries/member-composite-scores", () => ({ updateMemberCompositeScores: mocks.updateScores }))
vi.mock("@/lib/queries/member-center", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/queries/member-center")>(), updateMemberSection: mocks.updateMemberSection,
}))

import { saveMemberCompositeScores } from "./composite-score-actions"

const scores = { attractiveness_score: 2, sexual_value_score: 3, economic_value_score: 4, emotional_value_score: 5 }
const saved = { ...scores, member_id: "member-id", updated_at: "2026-10-23T09:00:00Z" }

describe("saveMemberCompositeScores", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ id: "admin-id" })
    mocks.updateScores.mockResolvedValue(saved)
  })

  it("saves only the shared scores with optimistic concurrency and leaves interview fields alone", async () => {
    const injected = { ...scores, communication: 5, interview_date: "2000-01-01" }
    expect(await saveMemberCompositeScores("member-id", injected, null, "  综合评分复核  "))
      .toEqual({ success: true, scores: saved })
    expect(mocks.requireAdmin).toHaveBeenCalledOnce()
    expect(mocks.updateScores).toHaveBeenCalledWith({ memberId: "member-id", scores, expectedUpdatedAt: null, reason: "综合评分复核" })
    expect(mocks.updateMemberSection).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/members/member-id")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/members/member-id/interview")
  })

  it("does not write if the administrator guard fails", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("ADMIN_REQUIRED"))
    await expect(saveMemberCompositeScores("member-id", scores, null, "综合评分复核")).rejects.toThrow("ADMIN_REQUIRED")
    expect(mocks.updateScores).not.toHaveBeenCalled()
  })

  it("rejects invalid scores, reasons and missing versions before any write", async () => {
    for (const value of [null, 0, 6, 3.5, "3"]) {
      const invalid = { ...scores, attractiveness_score: value } as MemberCompositeScoreValues
      expect((await saveMemberCompositeScores("member-id", invalid, null, "综合评分复核")).error).toContain("1–5")
    }
    for (const reason of ["短", " ", "长".repeat(501)]) {
      expect((await saveMemberCompositeScores("member-id", scores, null, reason)).error).toContain("保存原因")
    }
    expect((await saveMemberCompositeScores("member-id", scores, undefined as unknown as null, "综合评分复核")).error).toContain("版本")
    expect(mocks.updateScores).not.toHaveBeenCalled()
  })

  it("passes the original version and reports concurrent edits without retrying or overwriting", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.updateScores.mockRejectedValueOnce(new Error("VERSION_CONFLICT"))
    const result = await saveMemberCompositeScores("member-id", scores, saved.updated_at, "综合评分复核")
    expect(result.error).toContain("其他管理员更新")
    expect(mocks.updateScores).toHaveBeenCalledOnce()
    expect(mocks.updateScores).toHaveBeenCalledWith(expect.objectContaining({ expectedUpdatedAt: saved.updated_at }))
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    log.mockRestore()
  })
})
