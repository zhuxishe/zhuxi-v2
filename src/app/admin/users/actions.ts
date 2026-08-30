"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"

type AdminManagementRpcClient = {
  rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{
    data: T | null
    error: { code?: string; message: string } | null
  }>
}

function getAdminDb() {
  return createAdminClient()
}

/** 添加管理员白名单（预注册，user_id 留空） */
export async function addAdminWhitelist(
  email: string,
  role: "admin" | "super_admin",
  rawReason: string,
) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可操作" }
  if (role !== "admin" && role !== "super_admin") return { error: "管理员角色无效" }
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }

  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) return { error: "邮箱不能为空" }

  const db = await createClient()
  const rpc = db as unknown as AdminManagementRpcClient
  const { error } = await rpc.rpc<unknown>("admin_create_admin_whitelist", {
    p_email: normalizedEmail,
    p_role: role,
    p_reason: reasonResult.reason,
    p_name: normalizedEmail.split("@")[0],
  })

  if (error) {
    if (error.code === "23505") return { error: "该邮箱已在白名单中" }
    console.error("[addAdminWhitelist]", error)
    return { error: "操作失败" }
  }

  revalidatePath("/admin/users")
  return { success: true }
}

/** 删除管理员（白名单或已激活的都能删，但不能删自己） */
export async function removeAdmin(adminId: string, rawReason: string) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可操作" }
  if (admin.id === adminId) return { error: "不能删除自己" }
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }

  const db = await createClient()
  const rpc = db as unknown as AdminManagementRpcClient
  const { error } = await rpc.rpc<unknown>("admin_delete_admin_user", {
    p_admin_user_id: adminId,
    p_reason: reasonResult.reason,
  })

  if (error) {
    console.error("[removeAdmin]", error)
    if (error.message.includes("MEMBER_MASTER_LAST_SUPER_ADMIN_REQUIRED")) {
      return { error: "不能删除最后一位已激活的超级管理员" }
    }
    if (error.message.includes("MEMBER_MASTER_ADMIN_USER_NOT_FOUND")) {
      return { error: "管理员不存在或已被删除" }
    }
    return { error: "操作失败" }
  }
  revalidatePath("/admin/users")
  return { success: true }
}

/** 修改管理员角色（不能降级自己，也不能移除最后一位超级管理员） */
export async function updateAdminRole(
  adminId: string,
  role: "admin" | "super_admin",
  rawReason: string,
) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可操作" }
  if (role !== "admin" && role !== "super_admin") return { error: "管理员角色无效" }
  if (admin.id === adminId && role !== "super_admin") return { error: "不能降级自己的超级管理员权限" }
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }

  const db = await createClient()
  const rpc = db as unknown as AdminManagementRpcClient
  const { error } = await rpc.rpc<unknown>("admin_update_admin_user_role", {
    p_admin_user_id: adminId,
    p_role: role,
    p_reason: reasonResult.reason,
  })
  if (error) {
    console.error("[updateAdminRole]", error)
    if (error.message.includes("MEMBER_MASTER_LAST_SUPER_ADMIN_REQUIRED")) {
      return { error: "不能降级最后一位已激活的超级管理员" }
    }
    if (error.message.includes("MEMBER_MASTER_ADMIN_USER_NOT_FOUND")) {
      return { error: "管理员不存在或已被删除" }
    }
    return { error: "操作失败" }
  }
  revalidatePath("/admin/users")
  return { success: true }
}

/** 获取管理员列表 */
export async function fetchAdminList() {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可查看管理员列表", data: [] }
  const db = getAdminDb()

  const { data, error } = await db
    .from("admin_users")
    .select("id, email, name, role, user_id, created_at")
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[fetchAdminList]", error)
    return { error: "操作失败", data: [] }
  }
  return { data: data ?? [] }
}
