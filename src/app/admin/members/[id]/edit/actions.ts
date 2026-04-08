"use server"

import { revalidatePath } from "next/cache"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { requireAdmin } from "@/lib/auth/admin"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getAdminDb() {
  return createServiceClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** 只允许更新的字段白名单 */
const ALLOWED_FIELDS: Record<string, Set<string>> = {
  identity: new Set(["full_name", "nickname", "gender", "age_range", "nationality", "current_city", "school_name", "department", "degree", "hobby_tags", "activity_type_tags", "personality_self_tags", "taboo_tags"]),
  language: new Set(["native_language", "japanese_level", "communication_language_pref", "other_languages"]),
  interests: new Set(["scenario_mode_pref", "preferred_time_slots", "scenario_theme_tags", "non_script_preference", "game_type_pref", "accept_beginners", "accept_cross_school", "activity_area"]),
  personality: new Set(["warmup_speed", "expression_style_tags", "group_role_tags", "conflict_style", "social_energy_level"]),
  boundaries: new Set(["taboo_tags", "deal_breakers", "special_needs", "notes"]),
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
    .update({ ...clean, updated_at: new Date().toISOString() })
    .eq("member_id", memberId)
  if (error) return { error: error.message }
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
  if (error) return { error: error.message }
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
  if (error) return { error: error.message }
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
  if (error) return { error: error.message }
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
  if (error) return { error: error.message }
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
  if (error) return { error: error.message }
  revalidatePath("/admin/members")
  return { success: true }
}
