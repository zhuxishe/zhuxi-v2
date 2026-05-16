"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/auth/admin"

function getAdminDb() {
  return createAdminClient()
}

/** 只允许更新的字段白名单 */
const ALLOWED_FIELDS: Record<string, Set<string>> = {
  identity: new Set(["full_name", "nickname", "gender", "age_range", "nationality", "current_city", "school_name", "department", "degree_level", "course_language", "enrollment_year", "height_weight", "phone", "sns_accounts", "hobby_tags", "activity_type_tags", "personality_self_tags", "taboo_tags"]),
  language: new Set(["japanese_level", "communication_language_pref"]),
  interests: new Set(["activity_area", "nearest_station", "graduation_year", "scenario_mode_pref", "ideal_group_size", "script_preference", "non_script_preference", "activity_frequency", "preferred_time_slots", "budget_range", "travel_radius", "social_goal_primary", "social_goal_secondary", "accept_beginners", "accept_cross_school", "scenario_theme_tags", "game_type_pref"]),
  personality: new Set(["extroversion", "initiative", "expression_style_tags", "group_role_tags", "warmup_speed", "planning_style", "coop_compete_tendency", "emotional_stability", "boundary_strength", "reply_speed"]),
  boundaries: new Set(["taboo_tags", "deal_breakers", "preferred_age_range", "preferred_gender_mix", "boundary_notes"]),
}

/** 过滤掉不在白名单中的字段 */
function sanitize(data: Record<string, unknown>, table: string): Record<string, unknown> {
  const allowed = ALLOWED_FIELDS[table]
  if (!allowed) return {}
  const clean: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(data)) {
    if (allowed.has(key)) clean[key] = val
  }
  return clean
}

export async function updateMemberIdentity(memberId: string, data: Record<string, unknown>) {
  await requireAdmin()
  const clean = sanitize(data, "identity")
  if (Object.keys(clean).length === 0) return { error: "无有效更新字段" }
  const db = getAdminDb()
  const { error } = await db
    .from("member_identity")
    .upsert({ member_id: memberId, ...clean, updated_at: new Date().toISOString() }, { onConflict: "member_id" })
  if (error) {
    console.error("[adminMemberEdit]", error)
    return { error: "操作失败" }
  }
  revalidatePath(`/admin/members/${memberId}`)
  return { success: true }
}

export async function updateMemberLanguage(memberId: string, data: Record<string, unknown>) {
  await requireAdmin()
  const clean = sanitize(data, "language")
  if (Object.keys(clean).length === 0) return { error: "无有效更新字段" }
  const db = getAdminDb()
  const { error } = await db
    .from("member_language")
    .upsert({ member_id: memberId, ...clean, updated_at: new Date().toISOString() }, { onConflict: "member_id" })
  if (error) {
    console.error("[adminMemberEdit]", error)
    return { error: "操作失败" }
  }
  revalidatePath(`/admin/members/${memberId}`)
  return { success: true }
}

export async function updateMemberInterests(memberId: string, data: Record<string, unknown>) {
  await requireAdmin()
  const clean = sanitize(data, "interests")
  if (Object.keys(clean).length === 0) return { error: "无有效更新字段" }
  const db = getAdminDb()
  const { error } = await db
    .from("member_interests")
    .upsert({ member_id: memberId, ...clean, updated_at: new Date().toISOString() }, { onConflict: "member_id" })
  if (error) {
    console.error("[adminMemberEdit]", error)
    return { error: "操作失败" }
  }
  revalidatePath(`/admin/members/${memberId}`)
  return { success: true }
}

export async function updateMemberPersonality(memberId: string, data: Record<string, unknown>) {
  await requireAdmin()
  const clean = sanitize(data, "personality")
  if (Object.keys(clean).length === 0) return { error: "无有效更新字段" }
  const db = getAdminDb()
  const { error } = await db
    .from("member_personality")
    .upsert({ member_id: memberId, ...clean, updated_at: new Date().toISOString() }, { onConflict: "member_id" })
  if (error) {
    console.error("[adminMemberEdit]", error)
    return { error: "操作失败" }
  }
  revalidatePath(`/admin/members/${memberId}`)
  return { success: true }
}

export async function updateMemberBoundaries(memberId: string, data: Record<string, unknown>) {
  await requireAdmin()
  const clean = sanitize(data, "boundaries")
  if (Object.keys(clean).length === 0) return { error: "无有效更新字段" }
  const db = getAdminDb()
  const { error } = await db
    .from("member_boundaries")
    .upsert({ member_id: memberId, ...clean, updated_at: new Date().toISOString() }, { onConflict: "member_id" })
  if (error) {
    console.error("[adminMemberEdit]", error)
    return { error: "操作失败" }
  }
  revalidatePath(`/admin/members/${memberId}`)
  return { success: true }
}

/** 彻底删除成员（CASCADE 会清理关联表） — 仅限 super_admin */
export async function hardDeleteMember(memberId: string) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") {
    return { error: "只有超级管理员才能删除成员" }
  }
  const db = getAdminDb()
  const { error } = await db
    .from("members")
    .delete()
    .eq("id", memberId)
  if (error) {
    console.error("[adminMemberEdit]", error)
    return { error: "操作失败" }
  }
  revalidatePath("/admin/members")
  return { success: true }
}
