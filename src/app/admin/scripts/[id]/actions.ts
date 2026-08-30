"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/auth/admin"
import { revalidatePath } from "next/cache"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"

/** 批量授予剧本访问权 */
export async function grantScriptAccess(scriptId: string, memberIds: string[], rawReason: string) {
  await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  if (memberIds.length === 0) return { error: "请选择至少一个成员" }

  const supabase = await createClient()
  const rows = memberIds.map((mid) => ({
    script_id: scriptId,
    member_id: mid,
    can_view_full: true,
    audit_reason: reasonResult.reason,
  }))

  const { error } = await supabase
    .from("script_play_records")
    .upsert(rows, { onConflict: "script_id,member_id" })

  if (error) {
    console.error("[grantScriptAccess]", error)
    return { error: "操作失败" }
  }
  revalidatePath(`/admin/scripts/${scriptId}`)
  return { success: true, count: memberIds.length }
}

/** 撤销单个成员的剧本访问权 */
export async function revokeScriptAccess(scriptId: string, memberId: string, rawReason: string) {
  await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const supabase = await createClient()

  const { error } = await supabase
    .from("script_play_records")
    .update({ can_view_full: false, audit_reason: reasonResult.reason })
    .eq("script_id", scriptId)
    .eq("member_id", memberId)

  if (error) {
    console.error("[revokeScriptAccess]", error)
    return { error: "操作失败" }
  }
  revalidatePath(`/admin/scripts/${scriptId}`)
  return { success: true }
}

/** 获取已授权玩家列表 */
export async function fetchScriptAccessList(scriptId: string) {
  await requireAdmin()
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("script_play_records")
    .select(`
      member_id, can_view_full,
      member:members!script_play_records_member_id_fkey (
        id,
        member_identity (full_name)
      )
    `)
    .eq("script_id", scriptId)
    .eq("can_view_full", true)

  if (error) {
    console.error("[fetchScriptAccessList]", error)
    return { error: "操作失败", data: [] }
  }
  return { data: data ?? [] }
}
