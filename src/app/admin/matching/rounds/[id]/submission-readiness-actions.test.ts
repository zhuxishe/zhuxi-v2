import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ from: vi.fn(), admin: vi.fn(), rpc: vi.fn(), readiness: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from, rpc: mocks.rpc }) }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/matching/readiness-server", () => ({ fetchMemberMatchingReadiness: mocks.readiness }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
import { createSubmission, deleteSubmission, updateSubmission } from "./actions"

const round = { id: "round", purpose: "matching", status: "open", content_config: {}, deleted_at: null }
const answers = { game_type_pref: "都可以", gender_pref: "都可以", availability: { "2026-10-25": ["下午"] }, interest_tags: [], social_style: null, message: "updated answer" }
const complete = { supplementary: true, personality: true, quiz: true, missing: [] }
const incomplete = { supplementary: false, personality: true, quiz: false, missing: ["supplementary", "quiz"] }
const missingError = "该成员尚未完成：补充资料、性格测试。请成员完善资料后再报名或修改报名。"
function query(data: unknown) {
  const q = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(), update: vi.fn(), insert: vi.fn() }
  q.select.mockReturnValue(q)
  q.eq.mockReturnValue(q)
  q.single.mockResolvedValue({ data, error: null })
  q.maybeSingle.mockResolvedValue({ data, error: null })
  q.update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  q.insert.mockResolvedValue({ error: null })
  return q
}
function prepare(operation: "create" | "update", roundData = round) {
  const mutation = query(null)
  if (operation === "create") {
    mocks.from.mockReturnValueOnce(query(roundData)).mockReturnValueOnce(query(null)).mockReturnValueOnce(mutation)
  } else {
    mocks.from.mockReturnValueOnce(query({ round_id: "round", member_id: "saved-member" }))
      .mockReturnValueOnce(query(roundData)).mockReturnValueOnce(mutation)
  }
  return mutation
}
function submit(operation: "create" | "update") {
  return operation === "create"
    ? createSubmission("round", "target-member", answers, "按成员要求核对报名")
    : updateSubmission("submission", answers, "按成员要求核对报名", "2026-10-22T00:00:00.123456Z")
}

describe("admin matching submission profile requirements", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.admin.mockResolvedValue({ id: "admin", role: "super_admin" })
    mocks.readiness.mockResolvedValue(complete)
    mocks.rpc.mockResolvedValue({ error: null })
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => { vi.restoreAllMocks() })

  it.each(["create", "update"] as const)("blocks admin %s, names missing profiles, and leaves any original answer unchanged", async (operation) => {
    const mutation = prepare(operation)
    mocks.readiness.mockResolvedValue(incomplete)
    expect(await submit(operation)).toEqual({ error: missingError })
    expect(mocks.readiness).toHaveBeenCalledWith(operation === "create" ? "target-member" : "saved-member")
    expect(mutation.insert).not.toHaveBeenCalled()
    expect(mutation.update).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it.each(["create", "update"] as const)("allows admin %s when all profiles are complete and retains the audit reason", async (operation) => {
    const mutation = prepare(operation)
    expect(await submit(operation)).toEqual({ success: true })
    if (operation === "create") expect(mutation.insert).toHaveBeenCalledWith(expect.objectContaining({
      message: "updated answer", audit_reason: "按成员要求核对报名",
    }))
    else expect(mocks.rpc).toHaveBeenCalledWith("admin_update_matching_submission", {
      p_submission_id: "submission", p_expected_updated_at: "2026-10-22T00:00:00.123456Z",
      p_reason: "按成员要求核对报名", p_answers: answers,
    })
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/matching/rounds/round")
  })

  it.each(["create", "update"] as const)("fails closed on admin %s if the completion read fails", async (operation) => {
    const mutation = prepare(operation)
    mocks.readiness.mockRejectedValue(new Error("Read failed"))
    expect(await submit(operation)).toEqual({ error: "暂时无法检查成员资料完成状态，请重试。报名未新增或修改。" })
    expect(mutation.insert).not.toHaveBeenCalled()
    expect(mutation.update).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it.each(["create", "update"] as const)("explains database profile rejection during admin %s without claiming success", async (operation) => {
    const mutation = prepare(operation)
    const error = { message: "MATCHING_PROFILE_INCOMPLETE" }
    mutation.insert.mockResolvedValue({ error })
    mutation.update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error }) })
    if (operation === "update") mocks.rpc.mockResolvedValue({ error })
    mocks.readiness.mockResolvedValueOnce(complete).mockResolvedValueOnce(incomplete)
    expect(await submit(operation)).toEqual({ error: missingError })
    expect(mocks.readiness).toHaveBeenCalledTimes(2)
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it.each(["create", "update"] as const)("keeps super-admin authorization ahead of profile reads for %s", async (operation) => {
    mocks.admin.mockResolvedValue({ id: "admin", role: "admin" })
    expect((await submit(operation)).error).toContain("仅超级管理员")
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.readiness).not.toHaveBeenCalled()
  })

  it.each(["create", "update"] as const)("keeps matched-round protections ahead of profile reads for %s", async (operation) => {
    const mutation = prepare(operation, { ...round, status: "matched" })
    expect((await submit(operation)).error).toContain("已完成匹配")
    expect(mocks.readiness).not.toHaveBeenCalled()
    expect(mutation.insert).not.toHaveBeenCalled()
    expect(mutation.update).not.toHaveBeenCalled()
  })

  it("keeps a reason mandatory before attempting an administrative write", async () => {
    expect((await createSubmission("round", "member", answers, "")).error).toBeTruthy()
    expect((await updateSubmission("submission", answers, "")).error).toBeTruthy()
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.readiness).not.toHaveBeenCalled()
  })

  it("does not add this profile requirement to fixed activity registrations", async () => {
    prepare("create", { ...round, purpose: "registration" })
    expect((await submit("create")).error).toContain("只有匹配轮次")
    expect(mocks.readiness).not.toHaveBeenCalled()
  })

  it("allows deletion without checking completion, so missing profiles never prevent removal", async () => {
    mocks.readiness.mockRejectedValue(new Error("Must not check deletion"))
    mocks.from.mockReturnValueOnce(query({ round_id: "round", member_id: "saved-member" }))
      .mockReturnValueOnce(query(round))
    expect(await deleteSubmission("submission", "按成员要求取消报名")).toEqual({ success: true })
    expect(mocks.readiness).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledWith("admin_delete_operational_record", {
      p_entity: "match_round_submissions", p_id: "submission", p_reason: "按成员要求取消报名",
    })
  })

  it("rejects an admin edit missing its loaded timestamp and never obtains a fresh token to overwrite", async () => {
    prepare("update")
    expect((await updateSubmission("submission", answers, "核对并更正成员报名")).error).toContain("版本信息缺失")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("reports an admin edit conflict without claiming success or clearing input", async () => {
    prepare("update")
    mocks.rpc.mockResolvedValue({ error: { message: "MATCHING_SUBMISSION_CHANGED", code: "40001" } })
    expect((await submit("update")).error).toContain("已被其他页面或成员修改")
    expect(answers.message).toBe("updated answer")
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})
