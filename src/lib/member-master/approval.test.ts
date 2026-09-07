import { describe, expect, it } from "vitest"
import { memberApprovalBlockReason } from "./approval"

const submitted = {
  member: { status: "pending", recordSource: "app", profileStage: "submitted", onboardingStep: 4 },
  identity: {
    full_name: "测试玩家", gender: "other", age_range: "20-24", nationality: "中国", current_city: "东京",
    hobby_tags: ["音乐"], activity_type_tags: ["桌游"], personality_self_tags: ["温和"],
  },
}

describe("first player approval eligibility", () => {
  it.each(["app", "line"])("blocks an unfinished %s registration", (recordSource) => {
    expect(memberApprovalBlockReason({
      ...submitted,
      member: { ...submitted.member, recordSource, profileStage: "in_progress", onboardingStep: 1 },
    })).toContain("尚未提交资料")
  })

  it("blocks approval when the submitted identity row is missing", () => {
    expect(memberApprovalBlockReason({ ...submitted, identity: null })).toContain("必填资料不完整")
  })

  it.each([
    { full_name: " " }, { gender: "invalid" }, { age_range: null }, { nationality: "" }, { current_city: "" },
    { hobby_tags: [] }, { activity_type_tags: null }, { personality_self_tags: [] },
  ])("blocks missing required registration data: %o", (missing) => {
    expect(memberApprovalBlockReason({ ...submitted, identity: { ...submitted.identity, ...missing } })).toContain("必填资料不完整")
  })

  it("allows a submitted registration without optional school, nickname or taboo fields", () => {
    expect(memberApprovalBlockReason(submitted)).toBeNull()
  })

  it("retains the existing manual-member workflow and already-approved records", () => {
    expect(memberApprovalBlockReason({
      identity: null, member: { ...submitted.member, recordSource: "admin", profileStage: "not_started" },
    })).toBeNull()
    expect(memberApprovalBlockReason({
      identity: null, member: { ...submitted.member, status: "approved" },
    })).toBeNull()
  })

  it("matches the database exemption when re-approving an older complete profile", () => {
    expect(memberApprovalBlockReason({
      identity: null,
      member: { status: "rejected", recordSource: "line", profileStage: "complete", onboardingStep: 0 },
    })).toBeNull()
  })
})
