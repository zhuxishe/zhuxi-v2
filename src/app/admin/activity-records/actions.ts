"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { revalidatePath } from "next/cache"

interface ActivityInput {
  title: string
  activity_date: string
  location: string
  activity_type: string
  duration_minutes: number
  notes: string
  participant_ids: string[]
  late_member_ids: string[]
  no_show_member_ids: string[]
  reason: string
}

type ActivityRpcClient = {
  rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{
    data: T | null
    error: { code?: string; message: string } | null
  }>
}

function validateReason(rawReason: string) {
  const reason = rawReason.trim()
  if (reason.length < 4 || reason.length > 500) return { error: "请填写 4–500 个字符的操作原因" } as const
  return { reason } as const
}

function activityPayload(input: ActivityInput) {
  return {
    title: input.title,
    activity_date: input.activity_date,
    location: input.location || null,
    activity_type: input.activity_type || null,
    duration_minutes: input.duration_minutes,
    notes: input.notes || null,
    participant_ids: input.participant_ids,
    late_member_ids: input.late_member_ids,
    no_show_member_ids: input.no_show_member_ids,
  }
}

export async function createActivityRecord(input: ActivityInput) {
  await requireAdmin()

  if (!input.title?.trim()) return { error: "标题不能为空" }
  if (input.title.length > 200) return { error: "标题不能超过 200 字符" }
  if (input.location && input.location.length > 200) return { error: "地点不能超过 200 字符" }
  if (input.notes && input.notes.length > 2000) return { error: "备注不能超过 2000 字符" }
  if (input.participant_ids.length > 500) return { error: "参与人数不能超过 500" }
  const reasonResult = validateReason(input.reason)
  if ("error" in reasonResult) return reasonResult

  const supabase = await createClient() as unknown as ActivityRpcClient
  const { error } = await supabase.rpc<unknown>("admin_upsert_activity_record", {
    p_id: null,
    p_payload: activityPayload(input),
    p_reason: reasonResult.reason,
  })

  if (error) {
    console.error("[createActivityRecord]", error)
    return { error: "操作失败" }
  }
  revalidatePath("/admin/activity-records")
  return { success: true }
}

export async function updateActivityRecord(id: string, input: ActivityInput) {
  await requireAdmin()

  if (!input.title?.trim()) return { error: "标题不能为空" }
  if (input.title.length > 200) return { error: "标题不能超过 200 字符" }
  if (input.location && input.location.length > 200) return { error: "地点不能超过 200 字符" }
  if (input.notes && input.notes.length > 2000) return { error: "备注不能超过 2000 字符" }
  if (input.participant_ids.length > 500) return { error: "参与人数不能超过 500" }
  const reasonResult = validateReason(input.reason)
  if ("error" in reasonResult) return reasonResult

  const supabase = await createClient() as unknown as ActivityRpcClient
  const { error } = await supabase.rpc<unknown>("admin_upsert_activity_record", {
    p_id: id,
    p_payload: activityPayload(input),
    p_reason: reasonResult.reason,
  })

  if (error) {
    console.error("[updateActivityRecord]", error)
    return { error: "操作失败" }
  }
  revalidatePath("/admin/activity-records")
  return { success: true }
}

export async function deleteActivityRecord(id: string, rawReason: string) {
  await requireAdmin()
  const reasonResult = validateReason(rawReason)
  if ("error" in reasonResult) return reasonResult
  const supabase = await createClient() as unknown as ActivityRpcClient
  const { error } = await supabase.rpc<unknown>("admin_delete_activity_record", {
    p_id: id,
    p_reason: reasonResult.reason,
  })

  if (error) {
    console.error("[deleteActivityRecord]", error)
    return { error: "操作失败" }
  }
  revalidatePath("/admin/activity-records")
  return { success: true }
}
