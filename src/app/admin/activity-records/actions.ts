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
}

export async function createActivityRecord(input: ActivityInput) {
  const admin = await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from("activity_records")
    .insert({
      title: input.title,
      activity_date: input.activity_date,
      location: input.location,
      activity_type: input.activity_type,
      duration_minutes: input.duration_minutes,
      notes: input.notes,
      participant_ids: input.participant_ids,
      participant_count: input.participant_ids.length,
      late_member_ids: input.late_member_ids,
      no_show_member_ids: input.no_show_member_ids,
      created_by: admin.id,
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
  const supabase = await createClient()

  const { error } = await supabase
    .from("activity_records")
    .update({
      title: input.title,
      activity_date: input.activity_date,
      location: input.location,
      activity_type: input.activity_type,
      duration_minutes: input.duration_minutes,
      notes: input.notes,
      participant_ids: input.participant_ids,
      participant_count: input.participant_ids.length,
      late_member_ids: input.late_member_ids,
      no_show_member_ids: input.no_show_member_ids,
    })
    .eq("id", id)

  if (error) {
    console.error("[updateActivityRecord]", error)
    return { error: "操作失败" }
  }
  revalidatePath("/admin/activity-records")
  return { success: true }
}

export async function deleteActivityRecord(id: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from("activity_records")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("[deleteActivityRecord]", error)
    return { error: "操作失败" }
  }
  revalidatePath("/admin/activity-records")
  return { success: true }
}
