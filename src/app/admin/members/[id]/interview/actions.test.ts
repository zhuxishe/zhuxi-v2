import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), fetchMember360: vi.fn(), updateMemberSection: vi.fn(), revalidatePath: vi.fn(),
}))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/queries/member-center", () => ({
  fetchMember360: mocks.fetchMember360,
  updateMemberSection: mocks.updateMemberSection,
  memberCenterErrorMessage: () => "保存失败",
}))

import { submitInterviewEval, updateMemberStatus } from "./actions"
import { EVAL_DIMENSIONS } from "@/lib/constants/interview"
import type { InterviewEvalFormData } from "@/types"

const submitted = {
  member: { status: "pending", recordSource: "app", profileStage: "submitted", onboardingStep: 4 },
  identity: {
    full_name: "测试玩家", gender: "other", age_range: "20-24", nationality: "中国", current_city: "东京",
    hobby_tags: ["音乐"], activity_type_tags: ["桌游"], personality_self_tags: ["温和"],
  },
}

describe("administrator approval action", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ id: "admin-id" })
    mocks.fetchMember360.mockResolvedValue(submitted)
    mocks.updateMemberSection.mockResolvedValue({})
  })

  it("re-reads the canonical member and blocks stale UI approval of an unfinished draft", async () => {
    mocks.fetchMember360.mockResolvedValue({
      ...submitted, member: { ...submitted.member, profileStage: "in_progress", onboardingStep: 1 },
    })
    const result = await updateMemberStatus("canonical-member", "approved", "面试复核通过")
    expect(result.error).toContain("尚未提交资料")
    expect(mocks.fetchMember360).toHaveBeenCalledWith("canonical-member")
    expect(mocks.updateMemberSection).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("blocks an approval if the identity has gone missing", async () => {
    mocks.fetchMember360.mockResolvedValue({ ...submitted, identity: null })
    expect((await updateMemberStatus("canonical-member", "approved", "面试复核通过")).error).toContain("必填资料不完整")
    expect(mocks.updateMemberSection).not.toHaveBeenCalled()
  })

  it("approves a complete submitted registration and refreshes player and admin views", async () => {
    expect(await updateMemberStatus("canonical-member", "approved", "面试复核通过")).toEqual({ success: true })
    expect(mocks.updateMemberSection).toHaveBeenCalledWith({
      memberId: "canonical-member", section: "application", payload: { status: "approved" }, reason: "面试复核通过",
    })
    for (const path of ["/admin", "/admin/members", "/admin/members/canonical-member", "/app", "/app/profile"]) {
      expect(mocks.revalidatePath).toHaveBeenCalledWith(path)
    }
  })

  it("keeps rejection available without granting approval to an incomplete draft", async () => {
    expect(await updateMemberStatus("canonical-member", "rejected", "申请暂未通过")).toEqual({ success: true })
    expect(mocks.fetchMember360).not.toHaveBeenCalled()
    expect(mocks.updateMemberSection).toHaveBeenCalledOnce()
  })

  it("allows re-approval of an older complete profile under the database compatibility exemption", async () => {
    mocks.fetchMember360.mockResolvedValue({
      member: { status: "rejected", recordSource: "line", profileStage: "complete", onboardingStep: 0 },
      identity: null,
    })
    expect(await updateMemberStatus("canonical-member", "approved", "历史成员复核")).toEqual({ success: true })
    expect(mocks.updateMemberSection).toHaveBeenCalledOnce()
  })

  it("keeps historical interview saves separate from the shared score values", async () => {
    const data = {
      ...Object.fromEntries(EVAL_DIMENSIONS.map(({ key }) => [key, 4])),
      risk_level: "low", risk_notes: "", interviewer_notes: "面试记录",
      attractiveness_score: 5, sexual_value_score: 5,
    } as unknown as InterviewEvalFormData
    expect(await submitInterviewEval("member-id", data, undefined, "录入面试评估")).toEqual({ success: true })
    expect(mocks.updateMemberSection).toHaveBeenCalledOnce()
    const payload = mocks.updateMemberSection.mock.calls[0][0].payload
    expect(payload).not.toHaveProperty("attractiveness_score")
    expect(payload).not.toHaveProperty("sexual_value_score")
    expect(payload.communication).toBe(4)
    expect(payload.interviewer_notes).toBe("面试记录")
    expect(Object.keys(payload)).toHaveLength(20)
  })
})
