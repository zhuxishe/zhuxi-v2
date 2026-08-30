"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import { createClient } from "@/lib/supabase/server"

type MemberStatsRpcClient = {
  rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{
    data: T | null
    error: { code?: string; message: string } | null
  }>
}

export interface DynamicStatsOverrideInput {
  activityCount: number
  reviewCount: number
  avgReviewScore: number | null
  lateCount: number
  noShowCount: number
  complaintCount: number
  lastActivityAt: string | null
  reliabilityScore: number
  replayWillingRate: number | null
  recent5AvgScore: number | null
  reason: string
}

function refresh(memberId: string) {
  revalidatePath(`/admin/members/${memberId}`)
  revalidatePath(`/admin/members/${memberId}/stats`)
}

function isCount(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value <= 1_000_000
}

function isOptionalRange(value: unknown, min: number, max: number): value is number | null {
  return value === null
    || (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max)
}

export async function overrideMemberDynamicStats(
  memberId: string,
  input: DynamicStatsOverrideInput,
) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可以覆盖原始统计值" }
  const reasonResult = normalizeAdminAuditReason(input.reason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  if (
    ![
      input.activityCount,
      input.reviewCount,
      input.lateCount,
      input.noShowCount,
      input.complaintCount,
    ].every(isCount)
    || !isOptionalRange(input.avgReviewScore, 0, 5)
    || !isOptionalRange(input.recent5AvgScore, 0, 5)
    || !isOptionalRange(input.replayWillingRate, 0, 1)
    || typeof input.reliabilityScore !== "number"
    || !Number.isFinite(input.reliabilityScore)
    || input.reliabilityScore < 0
    || input.reliabilityScore > 5
    || (input.lastActivityAt !== null
      && (typeof input.lastActivityAt !== "string"
        || input.lastActivityAt.length > 64
        || Number.isNaN(Date.parse(input.lastActivityAt))))
  ) {
    return { error: "统计值格式或范围不正确" }
  }

  const db = await createClient() as unknown as MemberStatsRpcClient
  const { error } = await db.rpc<unknown>("admin_override_member_dynamic_stats", {
    p_member_id: memberId,
    p_payload: {
      activity_count: input.activityCount,
      review_count: input.reviewCount,
      avg_review_score: input.avgReviewScore,
      late_count: input.lateCount,
      no_show_count: input.noShowCount,
      complaint_count: input.complaintCount,
      last_activity_at: input.lastActivityAt,
      reliability_score: input.reliabilityScore,
      replay_willing_rate: input.replayWillingRate,
      recent5_avg_score: input.recent5AvgScore,
    },
    p_reason: reasonResult.reason,
  })
  if (error) {
    console.error("[overrideMemberDynamicStats]", error)
    return { error: "统计值保存失败，请检查输入范围" }
  }
  refresh(memberId)
  return { success: true }
}

export async function upsertMemberNote(input: {
  noteId: string | null
  memberId: string
  note: string
  reason: string
}) {
  await requireAdmin()
  const note = input.note.trim()
  if (!note || Array.from(note).length > 5000) return { error: "备注需为 1–5000 个字符" }
  const reasonResult = normalizeAdminAuditReason(input.reason)
  if (!reasonResult.ok) return { error: reasonResult.error }

  const db = await createClient() as unknown as MemberStatsRpcClient
  const { error } = await db.rpc<unknown>("admin_upsert_member_note", {
    p_note_id: input.noteId,
    p_member_id: input.memberId,
    p_note: note,
    p_reason: reasonResult.reason,
  })
  if (error) {
    console.error("[upsertMemberNote]", error)
    return { error: "备注保存失败" }
  }
  refresh(input.memberId)
  return { success: true }
}

export async function deleteMemberNote(input: {
  noteId: string
  memberId: string
  reason: string
}) {
  await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(input.reason)
  if (!reasonResult.ok) return { error: reasonResult.error }

  const db = await createClient() as unknown as MemberStatsRpcClient
  const { error } = await db.rpc<unknown>("admin_delete_operational_record", {
    p_entity: "member_notes",
    p_id: input.noteId,
    p_reason: reasonResult.reason,
  })
  if (error) {
    console.error("[deleteMemberNote]", error)
    return { error: "备注删除失败" }
  }
  refresh(input.memberId)
  return { success: true }
}
