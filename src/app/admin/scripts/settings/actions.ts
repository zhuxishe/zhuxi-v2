"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"

export interface PlayerActivitySettingsInput {
  largeActivitiesEnabled: boolean
  socialScriptsEnabled: boolean
  scriptLibraryEnabled: boolean
  largeHomeLimit: number
  socialHomeLimit: number
}

export async function updatePlayerActivitySettings(
  input: PlayerActivitySettingsInput,
  rawReason: string,
) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") {
    return { error: "只有超级管理员可以修改栏目开关和首页数量" }
  }
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }

  if (!Number.isInteger(input.largeHomeLimit) || input.largeHomeLimit < 0 || input.largeHomeLimit > 12) {
    return { error: "首页大型活动数量必须是 0–12 的整数" }
  }
  if (!Number.isInteger(input.socialHomeLimit) || input.socialHomeLimit < 0 || input.socialHomeLimit > 12) {
    return { error: "首页精选剧本数量必须是 0–12 的整数" }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("player_activity_settings")
    .update({
      large_activities_enabled: input.largeActivitiesEnabled,
      social_scripts_enabled: input.socialScriptsEnabled,
      script_library_enabled: input.scriptLibraryEnabled,
      large_home_limit: input.largeHomeLimit,
      social_home_limit: input.socialHomeLimit,
      updated_by: admin.id,
      audit_reason: reasonResult.reason,
    })
    .eq("id", 1)
    .select("large_activities_enabled, social_scripts_enabled, script_library_enabled, large_home_limit, social_home_limit")
    .single()

  if (error) {
    console.error("[updatePlayerActivitySettings]", error)
    if (error.code === "PGRST205" || error.message.includes("player_activity_settings")) {
      return { error: "数据库尚未应用内容管理 V2 数据库迁移" }
    }
    return { error: "活动首页设置保存失败" }
  }

  revalidatePath("/admin/scripts")
  revalidatePath("/app/scripts")
  revalidatePath("/app/scripts/large")
  revalidatePath("/app/scripts/social")
  revalidatePath("/app/scripts/library")
  return {
    success: true,
    settings: {
      largeActivitiesEnabled: data.large_activities_enabled,
      socialScriptsEnabled: data.social_scripts_enabled,
      scriptLibraryEnabled: data.script_library_enabled,
      largeHomeLimit: data.large_home_limit,
      socialHomeLimit: data.social_home_limit,
    },
  }
}
