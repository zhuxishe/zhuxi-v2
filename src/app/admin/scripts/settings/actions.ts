"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"

export async function updatePlayerActivitySettings(socialHomeLimit: number) {
  const admin = await requireAdmin()
  if (!Number.isInteger(socialHomeLimit) || socialHomeLimit < 1 || socialHomeLimit > 12) {
    return { error: "首页精选剧本数量必须是 1–12 的整数" }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("player_activity_settings")
    .update({
      social_home_limit: socialHomeLimit,
      updated_by: admin.id,
    })
    .eq("id", 1)
    .select("social_home_limit")
    .single()

  if (error) {
    console.error("[updatePlayerActivitySettings]", error)
    if (error.code === "PGRST205" || error.message.includes("player_activity_settings")) {
      return { error: "数据库尚未应用 Player Activity V1 迁移" }
    }
    return { error: "活动首页设置保存失败" }
  }

  revalidatePath("/admin/scripts")
  revalidatePath("/app/scripts")
  return { success: true, socialHomeLimit: data.social_home_limit }
}
