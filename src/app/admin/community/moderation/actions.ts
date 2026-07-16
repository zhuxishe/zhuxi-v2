"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import type { CommunityRevealedAuthor } from "@/components/admin/community/types"

type RpcResult<T> = PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>
type CommunityRpcClient = {
  rpc<T>(name: string, args?: Record<string, unknown>): RpcResult<T>
}

function getCommunityRpcClient() {
  return createAdminClient() as unknown as CommunityRpcClient
}

function friendlyRpcError(error: { code?: string; message: string } | null | undefined) {
  if (!error) return "操作失败，请稍后重试"
  if (error.message.includes("internal note") || error.message.includes("reason is required")) return "必须填写内部处理说明"
  if (error.message.includes("Pending report not found")) return "这条举报已被其他管理员处理"
  if (error.message.includes("permanently ban") || error.message.includes("super administrators")) return "只有超级管理员可以执行永久封禁"
  if (error.message.includes("not found")) return "目标内容或会员不存在"
  if (error.message.includes("Deleted")) return "已删除内容不能恢复"
  return "操作失败，请检查权限或稍后重试"
}

function revalidateModerationPaths(reportId?: string) {
  revalidatePath("/admin/community")
  revalidatePath("/admin/community/moderation")
  if (reportId) revalidatePath(`/admin/community/moderation/${reportId}`)
  revalidatePath("/admin/community/members")
  revalidatePath("/app/community")
}

async function fetchMemberSanctions(memberId: string): Promise<CommunityRevealedAuthor["sanctions"]> {
  const { data, error } = await createAdminClient()
    .from("community_sanctions")
    .select("id, sanction_type, reason, starts_at, ends_at, revoked_at")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) throw error
  return (data ?? []) as CommunityRevealedAuthor["sanctions"]
}

export async function resolveCommunityReport(
  reportId: string,
  decision: "dismissed" | "resolved" | "hidden" | "deleted",
  internalNote: string
) {
  const admin = await requireAdmin()
  const note = internalNote.trim()
  if (!note) return { error: "必须填写内部处理说明" }

  const adminDb = createAdminClient()
  const { data: report, error: reportError } = await adminDb
    .from("community_reports")
    .select("target_type, reported_post_id, reported_comment_id, status")
    .eq("id", reportId)
    .maybeSingle()
  if (reportError) return { error: "无法读取举报详情" }
  if (!report || report.status !== "pending") return { error: "这条举报已被其他管理员处理" }

  const rpc = getCommunityRpcClient()
  if (decision === "hidden" || decision === "deleted") {
    const targetId = report.target_type === "post" ? report.reported_post_id : report.target_type === "comment" ? report.reported_comment_id : null
    if (!targetId || !["post", "comment"].includes(report.target_type)) return { error: "社区身份举报不能执行隐藏或删除内容" }
    const contentResult = await rpc.rpc<null>("community_set_content_status", {
      p_target_type: report.target_type,
      p_target_id: targetId,
      p_status: decision === "hidden" ? "hidden" : "deleted",
      p_reason: note,
      p_report_id: reportId,
      p_admin_user_id: admin.id,
    })
    if (contentResult.error) return { error: friendlyRpcError(contentResult.error) }
  }

  const resolution = await rpc.rpc<null>("community_resolve_report", {
    p_report_id: reportId,
    p_resolution_status: decision === "dismissed" ? "dismissed" : "resolved",
    p_internal_note: note,
    p_admin_user_id: admin.id,
  })
  if (resolution.error) {
    return {
      error:
        decision === "hidden" || decision === "deleted"
          ? `内容已${decision === "hidden" ? "隐藏" : "删除"}，但举报未能关闭，请重试处理：${friendlyRpcError(resolution.error)}`
          : friendlyRpcError(resolution.error),
    }
  }

  revalidateModerationPaths(reportId)
  return { success: true as const }
}

export async function revealCommunityReportAuthor(reportId: string, auditReason: string) {
  const admin = await requireAdmin()
  const reason = auditReason.trim()
  if (!reason) return { error: "查看作者身份必须填写审计理由" }

  const adminDb = createAdminClient()
  const { data: report, error } = await adminDb
    .from("community_reports")
    .select("target_type, reported_post_id, reported_comment_id, reported_profile_id")
    .eq("id", reportId)
    .maybeSingle()
  if (error || !report) return { error: "举报不存在或无法读取" }

  const rpc = getCommunityRpcClient()
  if (report.target_type === "profile" && report.reported_profile_id) {
    const result = await rpc.rpc<Record<string, unknown>>("community_admin_get_member", {
      p_profile_id: report.reported_profile_id,
    })
    if (result.error || !result.data) return { error: friendlyRpcError(result.error) }
    const profile = result.data.profile as { id?: string; nickname?: string } | undefined
    const member = result.data.member as { id?: string; member_number?: string | null } | undefined
    if (!member?.id) return { error: "该社区身份已没有关联会员" }
    return {
      success: true as const,
      author: {
        member_id: member.id,
        profile_id: profile?.id ?? null,
        nickname: profile?.nickname ?? null,
        member_number: member.member_number ?? null,
        sanctions: await fetchMemberSanctions(member.id),
      } satisfies CommunityRevealedAuthor,
    }
  }

  const targetId = report.target_type === "post" ? report.reported_post_id : report.reported_comment_id
  const functionName = report.target_type === "post" ? "community_reveal_post_author" : "community_reveal_comment_author"
  if (!targetId) return { error: "被举报内容已经不可用" }
  const result = await rpc.rpc<CommunityRevealedAuthor[]>(functionName, {
    [report.target_type === "post" ? "p_post_id" : "p_comment_id"]: targetId,
    p_reason: reason,
    p_admin_user_id: admin.id,
  })
  if (result.error) return { error: friendlyRpcError(result.error) }
  const author = result.data?.[0]
  if (!author?.member_id) return { error: "该内容已没有关联会员" }
  author.sanctions = await fetchMemberSanctions(author.member_id)
  revalidateModerationPaths(reportId)
  return { success: true as const, author }
}

export async function applyCommunitySanction(
  memberId: string,
  sanctionType: "warning" | "mute" | "permanent_ban",
  reason: string,
  durationDays?: 1 | 7 | 30
) {
  const admin = await requireAdmin()
  const normalizedReason = reason.trim()
  if (!normalizedReason) return { error: "必须填写处罚原因" }
  if (sanctionType === "permanent_ban" && admin.role !== "super_admin") {
    return { error: "只有超级管理员可以执行永久封禁" }
  }
  if (sanctionType === "mute" && ![1, 7, 30].includes(durationDays ?? 0)) {
    return { error: "临时限制只能选择 1、7 或 30 天" }
  }

  const rpc = getCommunityRpcClient()
  const result = await rpc.rpc<string>("community_apply_sanction", {
    p_member_id: memberId,
    p_sanction_type: sanctionType,
    p_reason: normalizedReason,
    p_duration_days: sanctionType === "mute" ? durationDays : null,
    p_admin_user_id: admin.id,
  })
  if (result.error) return { error: friendlyRpcError(result.error) }
  revalidateModerationPaths()
  return { success: true as const, sanctionId: result.data }
}

export async function revokeCommunitySanction(sanctionId: string, reason: string) {
  const admin = await requireAdmin()
  const normalizedReason = reason.trim()
  if (!normalizedReason) return { error: "必须填写解除原因" }
  const rpc = getCommunityRpcClient()
  const result = await rpc.rpc<null>("community_revoke_sanction", {
    p_sanction_id: sanctionId,
    p_reason: normalizedReason,
    p_admin_user_id: admin.id,
  })
  if (result.error) return { error: friendlyRpcError(result.error) }
  revalidateModerationPaths()
  return { success: true as const }
}

export async function resetCommunityProfileAvatar(profileId: string, reason: string) {
  const admin = await requireAdmin()
  const normalizedReason = reason.trim()
  if (!normalizedReason) return { error: "重置头像必须填写内部处理说明" }
  const rpc = getCommunityRpcClient()
  const result = await rpc.rpc<null>("community_admin_reset_profile_avatar", {
    p_profile_id: profileId,
    p_reason: normalizedReason,
    p_admin_user_id: admin.id,
  })
  if (result.error) return { error: friendlyRpcError(result.error) }
  revalidateModerationPaths()
  revalidatePath(`/admin/community/members/${profileId}`)
  return { success: true as const }
}

export async function resetReportedCommunityProfileAvatar(reportId: string, reason: string) {
  const admin = await requireAdmin()
  const normalizedReason = reason.trim()
  if (!normalizedReason) return { error: "必须填写内部处理说明" }
  const db = createAdminClient()
  const { data: report, error: reportError } = await db
    .from("community_reports")
    .select("reported_profile_id, status")
    .eq("id", reportId)
    .eq("target_type", "profile")
    .maybeSingle<{ reported_profile_id: string | null; status: string }>()
  if (reportError) return { error: "无法读取举报详情" }
  if (!report?.reported_profile_id || report.status !== "pending") return { error: "这条头像举报已被处理或目标不可用" }

  const rpc = getCommunityRpcClient()
  const resetResult = await rpc.rpc<null>("community_admin_reset_profile_avatar", {
    p_profile_id: report.reported_profile_id,
    p_reason: normalizedReason,
    p_admin_user_id: admin.id,
  })
  if (resetResult.error) return { error: friendlyRpcError(resetResult.error) }

  const resolution = await rpc.rpc<null>("community_resolve_report", {
    p_report_id: reportId,
    p_resolution_status: "resolved",
    p_internal_note: normalizedReason,
    p_admin_user_id: admin.id,
  })
  if (resolution.error) return { error: `头像已重置，但举报未能关闭，请再次标记已处理：${friendlyRpcError(resolution.error)}` }
  revalidateModerationPaths(reportId)
  revalidatePath(`/admin/community/members/${report.reported_profile_id}`)
  return { success: true as const }
}
