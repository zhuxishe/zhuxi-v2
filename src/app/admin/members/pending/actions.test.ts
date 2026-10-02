import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PendingApplicationItem } from "@/types/pending-applications"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), read: vi.fn(), update: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/queries/pending-applications", () => ({ fetchPendingApplicationForApproval: mocks.read }))
vi.mock("@/lib/queries/member-center", () => ({ updateMemberSection: mocks.update, memberCenterErrorMessage: () => "操作失败，请刷新后重试" }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
import { approvePendingApplications } from "./actions"

const id = "11111111-1111-4111-8111-111111111111"
const other = "22222222-2222-4222-8222-222222222222"
const member: PendingApplicationItem = {
  id, fullName: "申请人", nickname: null, schoolName: "大学", submittedAt: "2026-10-01T00:00:00Z",
  createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00.123456Z", blockReason: null,
}

describe("quick approval of pending applications", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.admin.mockResolvedValue({ id: "admin" })
    mocks.read.mockImplementation(async (selectedId: string) => ({ ...member, id: selectedId }))
    mocks.update.mockResolvedValue({})
  })

  it("requires administrator permission before reading or writing applicants", async () => {
    mocks.admin.mockRejectedValue(new Error("not admin"))
    await expect(approvePendingApplications([id], "面试复核通过")).rejects.toThrow("not admin")
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each(["", "   ", "通过", "字".repeat(501), "😀".repeat(501)])("rejects an invalid audit reason", async (reason) => {
    expect((await approvePendingApplications([id], reason)).error).toContain("4–500")
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("validates untrusted argument types, empty selection, UUIDs and the 50-person limit", async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`)
    for (const ids of [[], ["not-a-uuid"], tooMany, [null] as unknown as string[], null as unknown as string[]]) {
      expect((await approvePendingApplications(ids, "面试复核通过")).error).toBeTruthy()
    }
    expect((await approvePendingApplications([id], null as unknown as string)).error).toBeTruthy()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("normalizes and deduplicates UUIDs and writes the exact re-read version with the trimmed reason", async () => {
    const mixedCaseId = "aaaaaaaa-1111-4111-8111-111111111111"
    const result = await approvePendingApplications([mixedCaseId, mixedCaseId.toUpperCase()], "  面试复核通过  ")
    expect(result.results).toEqual([{ id: mixedCaseId, success: true }])
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      memberId: mixedCaseId, section: "application", payload: { status: "approved" },
      reason: "面试复核通过", expectedUpdatedAt: member.updatedAt,
    })
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/members/pending")
    expect(mocks.revalidate).toHaveBeenCalledWith(`/admin/members/${mixedCaseId}`)
    expect(mocks.revalidate).toHaveBeenCalledWith("/app")
  })

  it("uses Unicode code points for the existing database reason limit", async () => {
    expect((await approvePendingApplications([id], "😀".repeat(500))).results?.[0].success).toBe(true)
  })

  it("rejects non-candidates and incomplete registrations without calling the approval RPC", async () => {
    mocks.read.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...member, blockReason: "注册必填资料不完整" })
    const result = await approvePendingApplications([id, other], "面试复核通过")
    expect(result.results).toEqual([
      { id, success: false, error: "该申请已处理或不再符合待审核条件，请刷新名单" },
      { id: other, success: false, error: "注册必填资料不完整" },
    ])
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("reports a version conflict without overwriting a concurrent update or hiding another success", async () => {
    mocks.update.mockImplementation(async ({ memberId }: { memberId: string }) => {
      if (memberId === other) throw new Error("MEMBER_MASTER_VERSION_CONFLICT")
      return {}
    })
    const result = await approvePendingApplications([id, other], "面试复核通过")
    expect(result.results).toEqual([
      { id, success: true },
      { id: other, success: false, error: "资料已被其他管理员更新，请刷新后重试" },
    ])
    expect(mocks.revalidate).toHaveBeenCalledWith(`/admin/members/${id}`)
    expect(mocks.revalidate).not.toHaveBeenCalledWith(`/admin/members/${other}`)
  })

  it("retains per-member read and database failures while continuing the rest of the batch", async () => {
    mocks.read.mockRejectedValueOnce(new Error("read failed"))
    mocks.update.mockRejectedValueOnce(new Error("MEMBER_PROFILE_SUBMISSION_REQUIRED"))
    const result = await approvePendingApplications([id, other], "面试复核通过")
    expect(result.results?.map((entry) => entry.success)).toEqual([false, false])
    expect(result.results?.[1].error).toContain("注册资料尚未完整提交")
    expect(mocks.update).toHaveBeenCalledOnce()
  })

  it("refuses to approve a completed applicant again on retry", async () => {
    const remaining = new Set([id])
    mocks.read.mockImplementation(async (selectedId: string) => remaining.has(selectedId) ? member : null)
    mocks.update.mockImplementation(async ({ memberId }: { memberId: string }) => { remaining.delete(memberId); return {} })
    expect((await approvePendingApplications([id], "面试复核通过")).results?.[0].success).toBe(true)
    expect((await approvePendingApplications([id], "面试复核通过")).results?.[0].success).toBe(false)
    expect(mocks.update).toHaveBeenCalledOnce()
  })

  it("limits concurrent work and preserves input order despite out-of-order completion", async () => {
    const ids = Array.from({ length: 9 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`)
    let active = 0, maxActive = 0
    mocks.update.mockImplementation(async ({ memberId }: { memberId: string }) => {
      active++; maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, memberId.endsWith("0") ? 10 : 1))
      active--
      return {}
    })
    const result = await approvePendingApplications(ids, "面试复核通过")
    expect(result.results?.map((entry) => entry.id)).toEqual(ids)
    expect(result.results?.every((entry) => entry.success)).toBe(true)
    expect(maxActive).toBe(4)
  })
})
