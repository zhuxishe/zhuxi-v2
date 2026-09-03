"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_BATCH_SIZE = 100
const MAX_ACCESS_DAYS = 366

/** Grant or renew expiring full-script access for verified Player members. */
export async function grantScriptAccess(
  scriptId: string,
  memberIds: string[],
  expiresAt: string,
  rawReason: string,
) {
  const admin = await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  if (!UUID_PATTERN.test(scriptId)) return { error: "剧本编号不合法" }
  const uniqueMemberIds = [...new Set(memberIds)]
  if (uniqueMemberIds.length === 0) return { error: "请选择至少一个成员" }
  if (uniqueMemberIds.length > MAX_BATCH_SIZE || uniqueMemberIds.some((id) => !UUID_PATTERN.test(id))) {
    return { error: `单次最多授权 ${MAX_BATCH_SIZE} 名有效成员` }
  }
  const expiration = new Date(expiresAt)
  const now = new Date()
  if (!Number.isFinite(expiration.getTime()) || expiration.getTime() <= now.getTime()) {
    return { error: "访问到期时间必须晚于当前时间" }
  }
  if (expiration.getTime() > now.getTime() + MAX_ACCESS_DAYS * 24 * 60 * 60 * 1000) {
    return { error: `单次授权期限不能超过 ${MAX_ACCESS_DAYS} 天` }
  }

  const supabase = await createClient()
  const scriptError = await ensureCurrentScript(supabase, scriptId)
  if (scriptError) return { error: scriptError }
  const { data: members, error: memberError } = await supabase
    .from("members")
    .select("id")
    .in("id", uniqueMemberIds)
    .eq("record_scope", "current")
    .eq("account_status", "active")
    .eq("status", "approved")
    .eq("membership_type", "player")
  if (memberError) return { error: "成员资格校验失败" }
  if ((members?.length ?? 0) !== uniqueMemberIds.length) {
    return { error: "所选成员中包含无效、停用、非当前或非 Player 会员，未执行任何授权" }
  }

  const grantedAt = now.toISOString()
  const rows = uniqueMemberIds.map((memberId) => ({
    script_id: scriptId,
    member_id: memberId,
    can_view_full: true,
    granted_at: grantedAt,
    expires_at: expiration.toISOString(),
    revoked_at: null,
    granted_by: admin.id,
    revoked_by: null,
    updated_at: grantedAt,
    audit_reason: reasonResult.reason,
  }))
  const { error } = await supabase
    .from("script_play_records")
    .upsert(rows, { onConflict: "script_id,member_id" })
  if (error) {
    console.error("[grantScriptAccess]", error)
    return { error: "授权失败" }
  }
  revalidateAccessPaths(scriptId)
  return { success: true, count: uniqueMemberIds.length }
}

/** Revoke immediately while retaining the audit history row. */
export async function revokeScriptAccess(scriptId: string, memberId: string, rawReason: string) {
  const admin = await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  if (!UUID_PATTERN.test(scriptId) || !UUID_PATTERN.test(memberId)) return { error: "编号不合法" }
  const supabase = await createClient()
  const scriptError = await ensureCurrentScript(supabase, scriptId)
  if (scriptError) return { error: scriptError }
  const revokedAt = new Date().toISOString()
  const { data, error } = await supabase
    .from("script_play_records")
    .update({
      can_view_full: false,
      revoked_at: revokedAt,
      revoked_by: admin.id,
      updated_at: revokedAt,
      audit_reason: reasonResult.reason,
    })
    .eq("script_id", scriptId)
    .eq("member_id", memberId)
    .eq("can_view_full", true)
    .select("id")
    .maybeSingle()
  if (error) {
    console.error("[revokeScriptAccess]", error)
    return { error: "撤销失败" }
  }
  if (!data) return { error: "该成员当前没有有效授权" }
  revalidateAccessPaths(scriptId)
  return { success: true }
}

/** Admin audit view includes active, expired and revoked grants. */
export async function fetchScriptAccessList(scriptId: string) {
  await requireAdmin()
  if (!UUID_PATTERN.test(scriptId)) return { error: "剧本编号不合法", data: [] }
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("script_play_records")
    .select(`
      member_id, can_view_full, granted_at, expires_at, revoked_at,
      member:members!script_play_records_member_id_fkey (
        id,
        member_identity (full_name)
      )
    `)
    .eq("script_id", scriptId)
    .order("updated_at", { ascending: false })
  if (error) {
    console.error("[fetchScriptAccessList]", error)
    return { error: "授权列表读取失败", data: [] }
  }
  return { data: data ?? [] }
}

function revalidateAccessPaths(scriptId: string) {
  revalidatePath(`/admin/scripts/${scriptId}`)
  revalidatePath(`/app/scripts/${scriptId}`)
}

async function ensureCurrentScript(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scriptId: string,
) {
  const { data, error } = await supabase
    .from("scripts")
    .select("id")
    .eq("id", scriptId)
    .is("archived_at", null)
    .maybeSingle()
  if (error) return "剧本状态校验失败"
  return data ? null : "剧本不存在或已进入回收站"
}
