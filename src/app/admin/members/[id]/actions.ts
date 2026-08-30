"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import {
  anonymizeMember,
  completeMemberAuthDelete,
  fetchMember360,
  fetchMemberLifecyclePreflight,
  hardDeleteBlankMember,
  memberCenterErrorMessage,
  resolveMemberDuplicateCandidate,
  restoreMemberEvent,
  setMemberAccountStatus,
} from "@/lib/queries/member-center"
import {
  coordinateMemberAnonymization,
  coordinateMemberLifecycle,
  MemberLifecycleCoordinationError,
  type MemberLifecycleAuthAdmin,
  type MemberLifecycleAuthSync,
} from "@/lib/queries/member-lifecycle-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import type { MemberLifecyclePreflight } from "@/types"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validateReason(reason: string) {
  const normalized = reason.trim()
  if (normalized.length < 4) return { ok: false, error: "请填写至少 4 个字符的操作原因" } as const
  if (normalized.length > 500) return { ok: false, error: "操作原因不得超过 500 个字符" } as const
  return { ok: true, reason: normalized } as const
}

function createAuthAdminGateway(): MemberLifecycleAuthAdmin {
  const authAdmin = createAdminClient().auth.admin
  return {
    async updateUserById(userId, attributes) {
      const { error } = await authAdmin.updateUserById(userId, attributes)
      return { error: error ? { message: error.message } : null }
    },
    async deleteUser(userId, shouldSoftDelete) {
      const { error } = await authAdmin.deleteUser(userId, shouldSoftDelete)
      return { error: error ? { message: error.message } : null }
    },
    async getUserById(userId) {
      const { data, error } = await authAdmin.getUserById(userId)
      if (error) {
        const authError = error as typeof error & { code?: string; status?: number }
        const notFound = authError.status === 404
          || authError.code === "user_not_found"
          || authError.message.toLowerCase().includes("user not found")
        return notFound
          ? { exists: false, error: null }
          : { exists: false, error: { message: error.message } }
      }
      return { exists: Boolean(data.user), error: null }
    },
  }
}

function lifecycleSuccessMessage(authSync: MemberLifecycleAuthSync, operation: string) {
  if (authSync === "synchronized") return `${operation}已写入本站数据库，并同步 Supabase 身份认证（Auth）登录状态。`
  if (authSync === "deleted") return `${operation}已写入本站数据库，成员主记录的登录绑定字段 user_id 已解除，Supabase 身份认证用户已删除。`
  return `${operation}已写入本站数据库；该成员未绑定身份认证字段 user_id，无身份认证账号需要同步。`
}

function lifecycleErrorMessage(error: unknown) {
  return error instanceof MemberLifecycleCoordinationError
    ? error.message
    : memberCenterErrorMessage(error)
}

export async function restoreMemberAuditAction(input: {
  memberId: string
  eventId: number | string
  reason: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { success: false, error: "仅超级管理员可以恢复审计事件" }
  if (!UUID_PATTERN.test(input.memberId)) return { success: false, error: "成员 ID 无效" }
  if ((typeof input.eventId !== "number" && typeof input.eventId !== "string") || String(input.eventId).trim() === "") {
    return { success: false, error: "审计事件 ID 无效" }
  }
  const reasonResult = validateReason(input.reason)
  if (!reasonResult.ok) return { success: false, error: reasonResult.error }

  try {
    await restoreMemberEvent(input.eventId, reasonResult.reason)
    revalidatePath(`/admin/members/${input.memberId}`)
    return { success: true }
  } catch (error) {
    console.error("[restoreMemberAuditAction]", error)
    return { success: false, error: memberCenterErrorMessage(error) }
  }
}

export async function preflightMemberLifecycleAction(
  memberId: string,
): Promise<
  | { success: true; impact: MemberLifecyclePreflight }
  | { success: false; error: string }
> {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { success: false, error: "仅超级管理员可以执行生命周期影响预检" }
  if (!UUID_PATTERN.test(memberId)) return { success: false, error: "成员 ID 无效" }
  try {
    const impact = await fetchMemberLifecyclePreflight(memberId)
    return { success: true, impact }
  } catch (error) {
    console.error("[preflightMemberLifecycleAction]", error)
    return { success: false, error: memberCenterErrorMessage(error) }
  }
}

export async function changeMemberAccountStatusAction(input: {
  memberId: string
  accountStatus: "active" | "suspended" | "closed"
  reason: string
}): Promise<{ success: true; message: string; authSync: MemberLifecycleAuthSync } | { success: false; error: string }> {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { success: false, error: "仅超级管理员可以修改账号生命周期" }
  if (!UUID_PATTERN.test(input.memberId)) return { success: false, error: "成员 ID 无效" }
  if (!["active", "suspended", "closed"].includes(input.accountStatus)) return { success: false, error: "账号状态不受支持" }
  const reasonResult = validateReason(input.reason)
  if (!reasonResult.ok) return { success: false, error: reasonResult.error }

  try {
    const current = await fetchMember360(input.memberId)
    const result = await coordinateMemberLifecycle({
      userId: current.account?.userId ?? null,
      previousAccountStatus: current.account?.accountStatus ?? null,
      targetAccountStatus: input.accountStatus,
      authAdmin: createAuthAdminGateway(),
      mutateDatabase: () => setMemberAccountStatus({
        memberId: input.memberId,
        accountStatus: input.accountStatus,
        reason: reasonResult.reason,
      }),
    })
    revalidatePath("/admin/members")
    revalidatePath(`/admin/members/${input.memberId}`)
    const operation = input.accountStatus === "active" ? "重新启用" : input.accountStatus === "suspended" ? "暂停" : "关闭"
    return {
      success: true,
      authSync: result.authSync,
      message: lifecycleSuccessMessage(result.authSync, operation),
    }
  } catch (error) {
    console.error("[changeMemberAccountStatusAction]", error)
    return { success: false, error: lifecycleErrorMessage(error) }
  }
}

export async function anonymizeMemberAction(input: {
  memberId: string
  confirmation: string
  reason: string
}): Promise<{ success: true; message: string; authSync: MemberLifecycleAuthSync } | { success: false; error: string; partialState?: boolean }> {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { success: false, error: "仅超级管理员可以匿名化成员" }
  if (!UUID_PATTERN.test(input.memberId)) return { success: false, error: "成员 ID 无效" }
  if (input.confirmation.trim() !== input.memberId) return { success: false, error: "确认文本与成员主记录 ID（members.id）不一致" }
  const reasonResult = validateReason(input.reason)
  if (!reasonResult.ok) return { success: false, error: reasonResult.error }

  try {
    const [current, impact] = await Promise.all([
      fetchMember360(input.memberId),
      fetchMemberLifecyclePreflight(input.memberId),
    ])
    const tombstoneUserId = typeof impact.auth_user_id_snapshot === "string"
      ? impact.auth_user_id_snapshot
      : null
    const authUserId = current.account?.userId ?? tombstoneUserId
    const result = await coordinateMemberAnonymization({
      userId: authUserId,
      previousAccountStatus: current.account?.accountStatus ?? null,
      alreadyAnonymized: current.account?.anonymizedAt !== null && current.account?.anonymizedAt !== undefined,
      authAdmin: createAuthAdminGateway(),
      mutateDatabase: () => anonymizeMember(input.memberId, reasonResult.reason),
      finalizeDatabase: authUserId
        ? () => completeMemberAuthDelete({
          memberId: input.memberId,
          authUserId,
          reason: reasonResult.reason,
        })
        : undefined,
    })
    revalidatePath("/admin/members")
    revalidatePath(`/admin/members/${input.memberId}`)
    return {
      success: true,
      authSync: result.authSync,
      message: lifecycleSuccessMessage(result.authSync, "匿名化并关闭"),
    }
  } catch (error) {
    console.error("[anonymizeMemberAction]", error)
    const partialState = error instanceof MemberLifecycleCoordinationError && error.databaseMayHaveChanged
    if (partialState) {
      revalidatePath("/admin/members")
      revalidatePath(`/admin/members/${input.memberId}`)
    }
    return { success: false, error: lifecycleErrorMessage(error), partialState }
  }
}

export async function resolveMemberDuplicateCandidateAction(input: {
  memberId: string
  candidateId: number | string
  resolution: "confirmed_duplicate" | "not_duplicate"
  reason: string
}): Promise<{ success: true; message: string } | { success: false; error: string }> {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { success: false, error: "仅超级管理员可以处置重复候选" }
  if (!UUID_PATTERN.test(input.memberId)) return { success: false, error: "成员 ID 无效" }
  if (!/^\d+$/.test(String(input.candidateId)) || Number(input.candidateId) <= 0) return { success: false, error: "重复候选 ID 无效" }
  if (!(["confirmed_duplicate", "not_duplicate"] as const).includes(input.resolution)) return { success: false, error: "重复候选处置值无效" }
  const reasonResult = validateReason(input.reason)
  if (!reasonResult.ok) return { success: false, error: reasonResult.error }

  try {
    await resolveMemberDuplicateCandidate({
      candidateId: input.candidateId,
      resolution: input.resolution,
      reason: reasonResult.reason,
    })
    revalidatePath(`/admin/members/${input.memberId}`)
    return {
      success: true,
      message: input.resolution === "confirmed_duplicate"
        ? "已标记为确认重复；仅记录人工结论，未自动合并。"
        : "已标记为非重复；未修改任何成员主记录。",
    }
  } catch (error) {
    console.error("[resolveMemberDuplicateCandidateAction]", error)
    return { success: false, error: memberCenterErrorMessage(error) }
  }
}

export async function hardDeleteBlankMemberAction(input: {
  memberId: string
  confirmation: string
  reason: string
}): Promise<{ success: true; message: string } | { success: false; error: string }> {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { success: false, error: "仅超级管理员可以硬删除空白测试壳记录" }
  if (!UUID_PATTERN.test(input.memberId)) return { success: false, error: "成员 ID 无效" }
  if (input.confirmation.trim() !== input.memberId) return { success: false, error: "确认文本与成员主记录 ID（members.id）不一致" }
  const reasonResult = validateReason(input.reason)
  if (!reasonResult.ok) return { success: false, error: reasonResult.error }

  try {
    const result = await hardDeleteBlankMember({
      memberId: input.memberId,
      confirmation: input.confirmation.trim(),
      reason: reasonResult.reason,
    })
    if (result.deleted !== true) return { success: false, error: "数据库未确认删除，请重新运行影响预检" }
    revalidatePath("/admin/members")
    return { success: true, message: "空白、未绑定、后台建立的测试壳记录已硬删除；审计快照仍保留。" }
  } catch (error) {
    console.error("[hardDeleteBlankMemberAction]", error)
    return { success: false, error: memberCenterErrorMessage(error) }
  }
}
