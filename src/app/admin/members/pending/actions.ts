"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import { memberCenterErrorMessage, updateMemberSection } from "@/lib/queries/member-center"
import { fetchPendingApplicationForApproval } from "@/lib/queries/pending-applications"
import { validateUuids } from "@/lib/sanitize"
import type { ApprovePendingApplicationsResult, PendingApplicationApprovalResult } from "@/types/pending-applications"

async function approveOne(id: string, reason: string): Promise<PendingApplicationApprovalResult> {
  try {
    const member = await fetchPendingApplicationForApproval(id)
    if (!member) return { id, success: false, error: "该申请已处理或不再符合待审核条件，请刷新名单" }
    if (member.blockReason) return { id, success: false, error: member.blockReason }
    await updateMemberSection({
      memberId: id, section: "application", payload: { status: "approved" }, reason,
      expectedUpdatedAt: member.updatedAt,
    })
    return { id, success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("VERSION_CONFLICT")) return { id, success: false, error: "资料已被其他管理员更新，请刷新后重试" }
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
