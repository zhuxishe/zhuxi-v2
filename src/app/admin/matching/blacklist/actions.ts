"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/auth/admin"
import { revalidatePath } from "next/cache"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"

type OperationalRpcClient = {
  rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{
    data: T | null
    error: { code?: string; message: string } | null
  }>
}

/** 搜索成员（供黑名单添加表单使用） */
export async function searchMembersForBlacklist(query: string) {
  await requireAdmin()
  if (!query || query.trim().length < 1) return []

  const supabase = createAdminClient()
  const q = query.trim()

  // 获取活跃成员，客户端过滤（避免 PostgREST 跨表 or 的复杂性）
  const { data: allData } = await supabase
    .from("members")
    .select("id, member_identity(full_name, nickname)")
    .eq("status", "approved")
    .limit(200)

  if (!allData) return []

  const lower = q.toLowerCase()
   
  return (allData as any[])
    .filter((m) => {
      const name = m.member_identity?.full_name ?? ""
      const nick = m.member_identity?.nickname ?? ""
      return (
        name.toLowerCase().includes(lower) ||
        nick.toLowerCase().includes(lower)
      )
    })
    .slice(0, 10)
    .map((m) => ({
      id: m.id,
      label: m.member_identity?.full_name ?? m.member_identity?.nickname ?? "未知",
    }))
}

/** 添加黑名单 —— 安全查询，无字符串拼接 */
export async function addBlacklist(
  memberAId: string,
  memberBId: string,
  reason: string
) {
  await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(reason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const supabase = await createClient()

  // 用两次独立查询替代 .or() 字符串模板拼接，避免 SQL 注入风险
  const { data: existAB } = await supabase
    .from("pair_relationships")
    .select("id")
    .eq("member_a_id", memberAId)
    .eq("member_b_id", memberBId)
    .maybeSingle()

  const { data: existBA } = await supabase
    .from("pair_relationships")
    .select("id")
    .eq("member_a_id", memberBId)
    .eq("member_b_id", memberAId)
    .maybeSingle()

  const existing = existAB ?? existBA

  if (existing) {
    const { error } = await supabase
      .from("pair_relationships")
      .update({
        status: "blacklist",
        notes: reasonResult.reason,
        audit_reason: reasonResult.reason,
      })
      .eq("id", existing.id)
    if (error) {
      console.error("[addBlacklist:update]", error)
      return { error: "操作失败" }
    }
  } else {
    const { error } = await supabase
      .from("pair_relationships")
      .insert({
        member_a_id: memberAId,
        member_b_id: memberBId,
        status: "blacklist",
        notes: reasonResult.reason,
        audit_reason: reasonResult.reason,
      })
    if (error) {
      console.error("[addBlacklist:insert]", error)
      return { error: "操作失败" }
    }
  }

  revalidatePath("/admin/matching/blacklist")
  return { success: true }
}

/** 删除黑名单记录 */
export async function removeBlacklist(relationId: string, rawReason: string) {
  await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const supabase = await createClient() as unknown as OperationalRpcClient

  const { error } = await supabase.rpc<unknown>("admin_delete_operational_record", {
    p_entity: "pair_relationships",
    p_id: relationId,
    p_reason: reasonResult.reason,
  })

  if (error) {
    console.error("[removeBlacklist]", error)
    return { error: "操作失败" }
  }

  revalidatePath("/admin/matching/blacklist")
  return { success: true }
}
