"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import {
  memberCenterErrorMessage,
  updateMemberSection,
  upsertLegacyMemberRecord,
} from "@/lib/queries/member-center"
import type { MemberCenterRecord } from "@/types"

type AdvancedSection = "account" | "quiz" | "roles" | "workflow"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED_KEYS: Record<AdvancedSection, Set<string>> = {
  account: new Set(["member_number", "membership_type", "user_id", "email", "line_user_id", "wechat_openid", "record_source"]),
  quiz: new Set(["answers", "score_e", "score_a", "score_o", "score_c", "score_n", "personality_type", "completed_at"]),
  roles: new Set(["roles"]),
  workflow: new Set(["profile_stage", "onboarding_step"]),
}
const LEGACY_EDITABLE_KEYS = new Set([
  "member_no",
  "full_name",
  "gender",
  "school",
  "department",
  "interest_tags",
  "social_tags",
  "game_mode",
  "compatibility_score",
  "session_count",
  "match_history",
  "claim_status",
])

export async function updateAdvancedMemberSectionAction(input: {
  memberId: string
  section: AdvancedSection
  payload: MemberCenterRecord
  reason: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { success: false, error: "仅超级管理员可以修改该分区" }
  if (!UUID_PATTERN.test(input.memberId)) return { success: false, error: "成员 ID 无效" }
  const reason = input.reason.trim()
  if (reason.length < 4 || reason.length > 500) return { success: false, error: "请填写 4–500 个字符的修改原因" }
  const allowed = ALLOWED_KEYS[input.section]
  const keys = Object.keys(input.payload)
  if (!allowed || keys.length === 0 || keys.some((key) => !allowed.has(key))) {
    return { success: false, error: "提交内容包含该分区不允许修改的字段" }
  }

  try {
    await updateMemberSection({
      memberId: input.memberId,
      section: input.section,
      payload: input.payload,
      reason,
    })
    revalidatePath("/admin/members")
    revalidatePath(`/admin/members/${input.memberId}`)
    return { success: true }
  } catch (error) {
    console.error(`[updateAdvancedMemberSectionAction:${input.section}]`, error)
    return { success: false, error: memberCenterErrorMessage(error) }
  }
}

export async function updateLegacyMemberAction(input: {
  memberId: string
  legacyId: string
  payload: MemberCenterRecord
  reason: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") {
    return { success: false, error: "仅超级管理员可以修改历史来源原始记录" }
  }
  if (!UUID_PATTERN.test(input.memberId) || !UUID_PATTERN.test(input.legacyId)) {
    return { success: false, error: "成员或历史记录 ID 无效" }
  }
  const reason = input.reason.trim()
  if (reason.length < 4 || reason.length > 500) {
    return { success: false, error: "请填写 4–500 个字符的修改原因" }
  }
  if (!input.payload || Array.isArray(input.payload)) {
    return { success: false, error: "历史记录内容无效" }
  }
  const keys = Object.keys(input.payload)
  if (keys.length === 0 || keys.some((key) => !LEGACY_EDITABLE_KEYS.has(key))) {
    return { success: false, error: "提交内容包含不可修改的 ID、关联字段或技术时间" }
  }

  try {
    await upsertLegacyMemberRecord({
      legacyId: input.legacyId,
      payload: input.payload,
      reason,
    })
    revalidatePath("/admin/members")
    revalidatePath(`/admin/members/${input.memberId}`)
    return { success: true }
  } catch (error) {
    console.error("[updateLegacyMemberAction]", error)
    return { success: false, error: memberCenterErrorMessage(error) }
  }
}
