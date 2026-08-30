"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { memberCenterErrorMessage, updateMemberSection } from "@/lib/queries/member-center"

const ALLOWED_FIELDS: Record<string, Set<string>> = {
  identity: new Set(["full_name", "nickname", "gender", "age_range", "nationality", "current_city", "school_name", "department", "degree_level", "course_language", "enrollment_year", "height_weight", "phone", "sns_accounts", "hobby_tags", "activity_type_tags", "personality_self_tags", "taboo_tags", "personal_avatar_path"]),
  language: new Set(["japanese_level", "communication_language_pref"]),
  interests: new Set(["activity_area", "nearest_station", "graduation_year", "scenario_mode_pref", "ideal_group_size", "script_preference", "non_script_preference", "activity_frequency", "preferred_time_slots", "budget_range", "travel_radius", "social_goal_primary", "social_goal_secondary", "accept_beginners", "accept_cross_school", "scenario_theme_tags", "game_type_pref"]),
  personality: new Set(["extroversion", "initiative", "expression_style_tags", "group_role_tags", "warmup_speed", "planning_style", "coop_compete_tendency", "emotional_stability", "boundary_strength", "reply_speed"]),
  boundaries: new Set(["taboo_tags", "deal_breakers", "preferred_age_range", "preferred_gender_mix", "boundary_notes"]),
  application: new Set(["interview_date", "interviewer", "attractiveness_score"]),
}

function sanitize(data: Record<string, unknown>, section: string): Record<string, unknown> {
  const allowed = ALLOWED_FIELDS[section]
  if (!allowed) return {}
  return Object.fromEntries(Object.entries(data).filter(([key]) => allowed.has(key)))
}

async function updateProfileSection(
  memberId: string,
  section: keyof typeof ALLOWED_FIELDS,
  data: Record<string, unknown>,
  rawReason: string,
) {
  await requireAdmin()
  const reason = rawReason.trim()
  if (reason.length < 4) return { error: "请填写至少 4 个字符的修改原因" }
  if (reason.length > 500) return { error: "修改原因不得超过 500 个字符" }
  const payload = sanitize(data, section)
  if (Object.keys(payload).length === 0) return { error: `${section} 分区没有可保存字段` }

  try {
    await updateMemberSection({ memberId, section, payload, reason })
    revalidatePath("/admin/members")
    revalidatePath(`/admin/members/${memberId}`)
    revalidatePath(`/admin/members/${memberId}/edit`)
    return { success: true }
  } catch (error) {
    console.error(`[updateMemberSection:${section}]`, error)
    return { error: memberCenterErrorMessage(error) }
  }
}

export async function updateMemberIdentity(memberId: string, data: Record<string, unknown>, reason: string) {
  return updateProfileSection(memberId, "identity", data, reason)
}

export async function updateMemberLanguage(memberId: string, data: Record<string, unknown>, reason: string) {
  return updateProfileSection(memberId, "language", data, reason)
}

export async function updateMemberInterests(memberId: string, data: Record<string, unknown>, reason: string) {
  return updateProfileSection(memberId, "interests", data, reason)
}

export async function updateMemberPersonality(memberId: string, data: Record<string, unknown>, reason: string) {
  return updateProfileSection(memberId, "personality", data, reason)
}

export async function updateMemberBoundaries(memberId: string, data: Record<string, unknown>, reason: string) {
  return updateProfileSection(memberId, "boundaries", data, reason)
}

export async function updateMemberApplication(memberId: string, data: Record<string, unknown>, reason: string) {
  return updateProfileSection(memberId, "application", data, reason)
}
