"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"

/** 添加管理员白名单（预注册，user_id 留空） */
export async function addAdminWhitelist(email: string, role: "admin" | "super_admin" = "admin") {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可操作" }

  const supabase = await createClient()
  const normalizedEmail = email.trim().toLowerCase()

  if (!normalizedEmail) return { error: "邮箱不能为空" }

  const { error } = await supabase
    .from("admin_users")
    .insert({ email: normalizedEmail, name: normalizedEmail.split("@")[0], role })

  if (error) {
    if (error.code === "23505") return { error: "该邮箱已在白名单中" }
    return { error: error.message }
  }

  return { success: true }
}

/** 删除管理员（白名单或已激活的都能删，但不能删自己） */
export async function removeAdmin(adminId: string) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可操作" }
  if (admin.id === adminId) return { error: "不能删除自己" }

  const supabase = await createClient()

  const { error } = await supabase
    .from("admin_users")
    .delete()
    .eq("id", adminId)

  if (error) return { error: error.message }
  return { success: true }
}

/** 获取管理员列表 */
export async function fetchAdminList() {
  await requireAdmin()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("admin_users")
    .select("id, email, name, role, user_id, created_at")
    .order("created_at", { ascending: true })

  if (error) return { error: error.message, data: [] }
  return { data: data ?? [] }
}
