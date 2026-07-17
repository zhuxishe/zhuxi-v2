"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"

export interface UpdateMemberProfileMetricsInput {
  memberId: string
  level: 1 | 2 | 3
  compatibilityScore: number
  compatibilityStatus: "pending" | "published"
  internalNote: string
}

export type MemberProfileMetricsActionResult =
  | { success: true }
  | { success: false; error: string }

type ProfileMetricsRpcClient = {
  rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{
    data: T | null
    error: { code?: string; message: string } | null
  }>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function revalidateMemberProfile(memberId: string) {
  revalidatePath(`/admin/members/${memberId}`)
  revalidatePath("/app/profile")
}

function isSingleDecimal(value: number) {
  return Math.abs(value * 10 - Math.round(value * 10)) < Number.EPSILON * 100
}

export async function updateMemberProfileMetrics(
  input: UpdateMemberProfileMetricsInput,
): Promise<MemberProfileMetricsActionResult> {
  await requireAdmin()

  if (!UUID_PATTERN.test(input.memberId)) {
    return { success: false, error: "成员编号无效，请刷新页面后重试" }
  }
  if (![1, 2, 3].includes(input.level)) {
    return { success: false, error: "会员等级只能选择 Lv.1 竹笋、Lv.2 青竹或 Lv.3 熊猫竹王" }
  }
  if (!Number.isFinite(input.compatibilityScore)
      || input.compatibilityScore < 1
      || input.compatibilityScore > 5
      || !isSingleDecimal(input.compatibilityScore)) {
    return { success: false, error: "合拍分数必须为 1.0–5.0，精确到一位小数" }
  }
  if (input.compatibilityStatus !== "pending" && input.compatibilityStatus !== "published") {
    return { success: false, error: "请选择有效的分数发布状态" }
  }

  const internalNote = input.internalNote.trim()
  if (!internalNote || internalNote.length > 2000) {
    return { success: false, error: "请填写内部备注，且不要超过 2000 个字符" }
  }

  const supabase = await createClient() as unknown as ProfileMetricsRpcClient
  const { error } = await supabase.rpc<null>("admin_update_member_profile_metrics", {
    p_member_id: input.memberId,
    p_level: input.level,
    p_compatibility_score: Number(input.compatibilityScore.toFixed(1)),
    p_compatibility_status: input.compatibilityStatus,
    p_internal_note: internalNote,
    p_score_source: "manual",
    p_audit_reason: "后台成员详情页手动更新",
  })

  if (error) {
    console.error("[updateMemberProfileMetrics]", error)
    return { success: false, error: "保存失败。请刷新页面后重试" }
  }

  revalidateMemberProfile(input.memberId)
  return { success: true }
}

export async function recalculateMemberActivityStats(
  memberId: string,
): Promise<MemberProfileMetricsActionResult> {
  await requireAdmin()

  if (!UUID_PATTERN.test(memberId)) {
    return { success: false, error: "成员编号无效，请刷新页面后重试" }
  }

  const supabase = await createClient() as unknown as ProfileMetricsRpcClient
  const { error } = await supabase.rpc<unknown>("admin_recalculate_member_activity_stats", {
    p_member_id: memberId,
    p_audit_reason: "后台成员详情页手动重算活动次数",
  })

  if (error) {
    console.error("[recalculateMemberActivityStats]", error)
    return { success: false, error: "活动次数重新计算失败，请稍后重试" }
  }

  revalidateMemberProfile(memberId)
  return { success: true }
}
