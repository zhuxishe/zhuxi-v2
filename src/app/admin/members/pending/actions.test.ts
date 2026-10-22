import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PendingApplicationItem } from "@/types/pending-applications"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), read: vi.fn(), server: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/queries/pending-applications", () => ({ fetchPendingApplicationForApproval: mocks.read }))
vi.mock("@/lib/queries/member-center", () => ({ memberCenterErrorMessage: () => "操作失败，请刷新后重试" }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.server }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
import { approvePendingApplications, ignorePendingApplication, restoreIgnoredApplication } from "./actions"

const id = "11111111-1111-4111-8111-111111111111"
const other = "22222222-2222-4222-8222-222222222222"
const member: PendingApplicationItem = {
  id, fullName: "申请人", nickname: null, schoolName: "大学", submittedAt: "2026-10-01T00:00:00Z",
  createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00.123456Z", blockReason: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.admin.mockResolvedValue({ id: "admin" })
  mocks.read.mockImplementation(async (selectedId: string) => ({ ...member, id: selectedId }))
  mocks.server.mockResolvedValue({ rpc: mocks.rpc })
  mocks.rpc.mockImplementation(async (name: string, input: { p_member_id: string; p_ignored?: boolean }) => {
    const data = name === "admin_approve_pending_application"
      ? { member_id: input.p_member_id, section: "application", updated_at: "2026-10-23T10:00:00.123456Z", changed_fields: ["status"], event_id: "audit-event", data: { status: "approved" } }
      : { member_id: input.p_member_id.toLowerCase(), ignored: input.p_ignored, ignored_at: input.p_ignored ? "2026-10-23T10:00:00.654321Z" : null, event_id: "audit-event" }
    return { data, error: null }
  })
})

describe("quick approval of pending applications", () => {
  it("requires administrator permission before reading or writing applicants", async () => {
    mocks.admin.mockRejectedValue(new Error("not admin"))
    await expect(approvePendingApplications([id], "面试复核通过")).rejects.toThrow("not admin")
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.server).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each(["", "   ", "通过", "字".repeat(501), "😀".repeat(501)])("rejects an invalid audit reason", async (reason) => {
    expect((await approvePendingApplications([id], reason)).error).toContain("4–500")
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.server).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("validates untrusted argument types, empty selection, UUIDs and the 50-person limit", async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`)
    for (const ids of [[], ["not-a-uuid"], tooMany, [null] as unknown as string[], null as unknown as string[]]) {
      expect((await approvePendingApplications(ids, "面试复核通过")).error).toBeTruthy()
    }
    expect((await approvePendingApplications([id], null as unknown as string)).error).toBeTruthy()
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.server).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("normalizes and deduplicates UUIDs and writes the exact re-read version with the trimmed reason", async () => {
    const mixedCaseId = "aaaaaaaa-1111-4111-8111-111111111111"
    const result = await approvePendingApplications([mixedCaseId, mixedCaseId.toUpperCase()], "  面试复核通过  ")
    expect(result.results).toEqual([{ id: mixedCaseId, success: true }])
    expect(mocks.server).toHaveBeenCalledOnce()
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_approve_pending_application", {
      p_member_id: mixedCaseId, p_reason: "面试复核通过", p_expected_updated_at: member.updatedAt,
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
    expect(mocks.server).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("reports a version conflict without overwriting a concurrent update or hiding another success", async () => {
    mocks.rpc.mockImplementation(async (_name: string, { p_member_id }: { p_member_id: string }) => {
      if (p_member_id === other) return { data: null, error: { message: "MEMBER_MASTER_VERSION_CONFLICT" } }
      return { data: { member_id: p_member_id, section: "application", data: { status: "approved" } }, error: null }
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
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "MEMBER_PROFILE_SUBMISSION_REQUIRED" } })
    const result = await approvePendingApplications([id, other], "面试复核通过")
    expect(result.results?.map((entry) => entry.success)).toEqual([false, false])
    expect(result.results?.[1].error).toContain("注册资料尚未完整提交")
    expect(mocks.rpc).toHaveBeenCalledOnce()
  })

  it("refuses to approve a completed applicant again on retry", async () => {
    const remaining = new Set([id])
    mocks.read.mockImplementation(async (selectedId: string) => remaining.has(selectedId) ? member : null)
    mocks.rpc.mockImplementation(async (_name: string, { p_member_id }: { p_member_id: string }) => {
      remaining.delete(p_member_id)
      return { data: { member_id: p_member_id, section: "application", data: { status: "approved" } }, error: null }
    })
    expect((await approvePendingApplications([id], "面试复核通过")).results?.[0].success).toBe(true)
    expect((await approvePendingApplications([id], "面试复核通过")).results?.[0].success).toBe(false)
    expect(mocks.rpc).toHaveBeenCalledOnce()
  })

  it("limits concurrent work and preserves input order despite out-of-order completion", async () => {
    const ids = Array.from({ length: 9 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`)
    let active = 0, maxActive = 0
    mocks.rpc.mockImplementation(async (_name: string, { p_member_id }: { p_member_id: string }) => {
      active++; maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, p_member_id.endsWith("0") ? 10 : 1))
      active--
      return { data: { member_id: p_member_id, section: "application", data: { status: "approved" } }, error: null }
    })
    const result = await approvePendingApplications(ids, "面试复核通过")
    expect(result.results?.map((entry) => entry.id)).toEqual(ids)
    expect(result.results?.every((entry) => entry.success)).toBe(true)
    expect(maxActive).toBe(4)
  })

  it("does not approve or refresh when the applicant was ignored after the eligibility read", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "PENDING_APPLICATION_ALREADY_IGNORED" } })
    const result = await approvePendingApplications([id], "面试复核通过")
    expect(result.results).toEqual([{ id, success: false, error: "该申请已被忽略、已处理或资料发生变化，请刷新名单后核对" }])
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("does not report approval success without a database acknowledgement", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null })
    const result = await approvePendingApplications([id], "面试复核通过")
    expect(result.results?.[0].success).toBe(false)
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})

describe.each([
  ["ignore", ignorePendingApplication, true],
  ["restore", restoreIgnoredApplication, false],
] as const)("%s pending applications", (_operation, action, ignored) => {
  const version = "2026-10-23T10:00:00.654321Z"

  it("requires administrator permission before validating input or creating a database client", async () => {
    mocks.admin.mockRejectedValue(new Error("not admin"))
    await expect(action("not-a-uuid", "not-a-timestamp", "")).rejects.toThrow("not admin")
    expect(mocks.server).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("rejects invalid argument types, UUIDs, versions and reasons before creating a client", async () => {
    const invalidInputs: unknown[][] = [
      [null, version, "申请操作备注"], [123, version, "申请操作备注"], [[], version, "申请操作备注"],
      ["not-a-uuid", version, "申请操作备注"], ["", version, "申请操作备注"],
      [id, null, "申请操作备注"], [id, 123, "申请操作备注"], [id, "", "申请操作备注"],
      [id, "   ", "申请操作备注"], [id, "not-a-timestamp", "申请操作备注"],
      [id, version, null], [id, version, 123], [id, version, ""], [id, version, "   "],
      [id, version, "忽略"], [id, version, "字".repeat(501)], [id, version, "😀".repeat(501)],
    ]
    for (const [memberId, expectedVersion, reason] of invalidInputs) {
      const result = await action(memberId as string, expectedVersion as string, reason as string)
      expect(result.error).toBeTruthy()
      expect(result.success).toBeUndefined()
    }
    expect(mocks.admin).toHaveBeenCalledTimes(invalidInputs.length)
    expect(mocks.server).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("passes the exact version and trimmed reason to the authenticated RPC and refreshes only the affected admin pages", async () => {
    expect(await action(id, version, "  申请操作备注  ")).toEqual({ success: true })
    expect(mocks.server).toHaveBeenCalledOnce()
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_set_pending_application_ignored", {
      p_member_id: id, p_ignored: ignored, p_reason: "申请操作备注",
      p_expected_updated_at: ignored ? version : null,
      p_expected_ignored_at: ignored ? null : version,
    })
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.revalidate.mock.calls.map(([path]) => path)).toEqual(["/admin", "/admin/members/pending", `/admin/members/${id}`])
    expect(mocks.revalidate.mock.calls.every(([path]) => String(path).startsWith("/admin"))).toBe(true)
  })

  it("accepts 500 Unicode code points using the same limit as the database", async () => {
    expect(await action(id, version, "😀".repeat(500))).toEqual({ success: true })
    expect(mocks.rpc.mock.calls[0][1].p_reason).toBe("😀".repeat(500))
  })

  it.each([
    ["PENDING_APPLICATION_VERSION_CONFLICT", "其他管理员更新"],
    ["PENDING_APPLICATION_ALREADY_IGNORED", "已被忽略"],
    ["PENDING_APPLICATION_NOT_ELIGIBLE", "不再符合待审核条件"],
    ["42501 permission denied", "操作失败"],
  ])("keeps a failed %s operation visible without success or refresh", async (message, expected) => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message } })
    const result = await action(id, version, "申请操作备注")
    expect(result.success).toBeUndefined()
    expect(result.error).toContain(expected)
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it.each([
    ["null", null], ["empty object", {}], ["boolean", true], ["array", [{ member_id: id, ignored }]],
    ["wrong member", { member_id: other, ignored }],
    ["wrong state", { member_id: id, ignored: !ignored }],
    ["string state", { member_id: id, ignored: String(ignored) }],
    ["error acknowledgement", { error: "PENDING_APPLICATION_VERSION_CONFLICT" }],
  ])("does not report success for a %s acknowledgement", async (_label, data) => {
    mocks.rpc.mockResolvedValueOnce({ data, error: null })
    const result = await action(id, version, "申请操作备注")
    expect(result.success).toBeUndefined()
    expect(result.error).toContain("处理结果尚未确认")
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("keeps an uncertain transport failure as an error without refreshing", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("connection lost"))
    const result = await action(id, version, "申请操作备注")
    expect(result.success).toBeUndefined()
    expect(result.error).toContain("处理结果尚未确认")
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})
