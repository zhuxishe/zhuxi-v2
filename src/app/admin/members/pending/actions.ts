"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import { memberCenterErrorMessage } from "@/lib/queries/member-center"
import { fetchPendingApplicationForApproval } from "@/lib/queries/pending-applications"
import { createClient } from "@/lib/supabase/server"
import { validateUuids } from "@/lib/sanitize"
import type { ApprovePendingApplicationsResult, PendingApplicationApprovalResult } from "@/types/pending-applications"

async function approveOne(id: string, reason: string): Promise<PendingApplicationApprovalResult> {
  try {
    const member = await fetchPendingApplicationForApproval(id)
    if (!member) return { id, success: false, error: "该申请已处理或不再符合待审核条件，请刷新名单" }
    if (member.blockReason) return { id, success: false, error: member.blockReason }
    const client = await createClient()
    const { data, error } = await client.rpc("admin_approve_pending_application", {
      p_member_id: id, p_reason: reason, p_expected_updated_at: member.updatedAt,
    })
    if (error) throw new Error(error.message)
    if (!data) throw new Error("申请处理结果尚未确认，请刷新后核对")
    return { id, success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("VERSION_CONFLICT")) return { id, success: false, error: "资料已被其他管理员更新，请刷新后重试" }
    if (message.includes("PENDING_APPLICATION_")) return { id, success: false, error: "该申请已被忽略、已处理或资料发生变化，请刷新名单后核对" }
    if (message.includes("PROFILE_SUBMISSION_REQUIRED")) return { id, success: false, error: "注册资料尚未完整提交，请核对后再通过审核" }
    return { id, success: false, error: memberCenterErrorMessage(error) }
  }
}

export async function approvePendingApplications(memberIds: string[], rawReason: string): Promise<ApprovePendingApplicationsResult> {
  await requireAdmin()
  if (typeof rawReason !== "string") return { error: "请填写本次通过理由" }
  const reason = normalizeAdminAuditReason(rawReason)
  if (!reason.ok) return { error: reason.error }
  if (!Array.isArray(memberIds) || memberIds.some((id) => typeof id !== "string")) return { error: "申请名单无效，请刷新后重试" }
  const ids = [...new Set(memberIds.map((id) => id.toLowerCase()))]
  if (!ids.length) return { error: "请先选择待处理申请" }
  if (ids.length > 50) return { error: "每次最多处理 50 位申请人" }
  try { validateUuids(ids) } catch { return { error: "申请名单无效，请刷新后重试" } }

  // Each existing RPC commits and audits independently; preserve partial results.
  const results: PendingApplicationApprovalResult[] = []
  for (let offset = 0; offset < ids.length; offset += 4) {
    results.push(...await Promise.all(ids.slice(offset, offset + 4).map((id) => approveOne(id, reason.reason))))
  }
  const approved = results.filter((result) => result.success)
  if (approved.length) {
    for (const path of ["/admin", "/admin/members", "/admin/members/pending", "/app", "/app/profile", "/app/profile/edit", "/admin/community/members"]) revalidatePath(path)
    for (const { id } of approved) {
      revalidatePath(`/admin/members/${id}`)
      revalidatePath(`/admin/members/${id}/interview`)
    }
  }
  return { results }
}

type TriageResult = { success?: true; error?: string }

async function setIgnored(memberId: string, version: string, rawReason: string, ignored: boolean): Promise<TriageResult> {
  await requireAdmin()
  if (typeof memberId !== "string" || typeof version !== "string" || !version.trim() || !Number.isFinite(Date.parse(version))) {
    return { error: "申请信息无效，请刷新名单后重试" }
  }
  try { validateUuids([memberId]) } catch { return { error: "申请信息无效，请刷新名单后重试" } }
  if (typeof rawReason !== "string") return { error: "请填写本次操作备注" }
  const reason = normalizeAdminAuditReason(rawReason)
  if (!reason.ok) return { error: reason.error }
  try {
    const client = await createClient()
    const { data, error } = await client.rpc("admin_set_pending_application_ignored", {
      p_member_id: memberId, p_ignored: ignored, p_reason: reason.reason,
      p_expected_updated_at: ignored ? version : null,
      p_expected_ignored_at: ignored ? null : version,
    })
    if (error) {
      if (error.message.includes("PENDING_APPLICATION_VERSION_CONFLICT")) return { error: "该申请已被其他管理员更新，请刷新名单后重试" }
      if (error.message.includes("PENDING_APPLICATION_ALREADY_IGNORED")) return { error: "该申请已被忽略，请刷新名单后核对操作记录" }
      if (error.message.includes("PENDING_APPLICATION_NOT_ELIGIBLE")) return { error: "该申请已处理或不再符合待审核条件，请刷新名单" }
      return { error: memberCenterErrorMessage(new Error(error.message)) }
    }
    if (!data || typeof data !== "object" || Array.isArray(data) || data.ignored !== ignored || data.member_id !== memberId.toLowerCase()) {
      return { error: "处理结果尚未确认，请刷新名单后核对" }
    }
    for (const path of ["/admin", "/admin/members/pending", `/admin/members/${memberId}`]) revalidatePath(path)
    return { success: true }
  } catch {
    return { error: "处理结果尚未确认，请刷新名单后核对；备注可保留后重试" }
  }
}

export async function ignorePendingApplication(memberId: string, expectedUpdatedAt: string, reason: string): Promise<TriageResult> {
  return setIgnored(memberId, expectedUpdatedAt, reason, true)
}

export async function restoreIgnoredApplication(memberId: string, expectedIgnoredAt: string, reason: string): Promise<TriageResult> {
  return setIgnored(memberId, expectedIgnoredAt, reason, false)
}
