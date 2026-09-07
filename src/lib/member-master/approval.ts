import type { Member360 } from "@/types/member-center"

const REQUIRED_IDENTITY_TEXT = ["full_name", "age_range", "nationality", "current_city"] as const
const REQUIRED_IDENTITY_TAGS = ["hobby_tags", "activity_type_tags", "personality_self_tags"] as const

/** App/LINE applicants must finish their own registration before first approval. */
export function memberApprovalBlockReason(
  data: {
    member: Pick<Member360["member"], "status" | "recordSource" | "profileStage" | "onboardingStep">
    identity: Member360["identity"]
  },
): string | null {
  // Match the database guard: an already-complete historical profile can be
  // re-approved without imposing the newer registration fields retroactively.
  if (data.member.status === "approved" || data.member.profileStage === "complete"
    || !["app", "line"].includes(data.member.recordSource ?? "")) return null
  if (data.member.profileStage !== "submitted"
    || data.member.onboardingStep !== 4) {
    return "尚未提交资料，请等待玩家完成填写并提交后再通过审核。"
  }
  const identity = data.identity
  if (!identity
    || REQUIRED_IDENTITY_TEXT.some((key) => typeof identity[key] !== "string" || !(identity[key] as string).trim())
    || !["male", "female", "other"].includes(String(identity.gender))
    || REQUIRED_IDENTITY_TAGS.some((key) => !Array.isArray(identity[key]) || (identity[key] as unknown[]).length === 0)) {
    return "注册必填资料不完整，请先核对基本信息、兴趣、活动偏好和性格标签。"
  }
  return null
}
