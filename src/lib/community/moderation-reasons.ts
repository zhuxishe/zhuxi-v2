import type { CommunityAdminReasonCode } from "@/components/admin/community/types"

export const COMMUNITY_REMOVAL_REASONS = [
  { code: "privacy", label: "可能涉及个人隐私" },
  { code: "harassment", label: "骚扰或攻击性内容" },
  { code: "spam", label: "重复、广告或无关内容" },
  { code: "inappropriate", label: "不适合社区展示" },
  { code: "other", label: "其他违反社区规范的情况" },
] as const satisfies ReadonlyArray<{ code: CommunityAdminReasonCode; label: string }>

export const COMMUNITY_RESTORE_REASON = {
  code: "reviewed_restore",
  label: "管理员复核后恢复展示",
} as const satisfies { code: CommunityAdminReasonCode; label: string }

export function isCommunityRemovalReason(value: string): value is Exclude<CommunityAdminReasonCode, "reviewed_restore"> {
  return COMMUNITY_REMOVAL_REASONS.some((reason) => reason.code === value)
}
