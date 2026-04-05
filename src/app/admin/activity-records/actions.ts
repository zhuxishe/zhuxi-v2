"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"

interface ActivityInput {
  title: string
  activity_date: string
  location: string
  activity_type: string
  duration_minutes: number
  notes: string
}

export async function createActivityRecord(input: ActivityInput) {
  const admin = await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from("activity_records")
    .insert({
      ...input,
      participant_count: 0,
      created_by: admin.id,
    })

  if (error) return { error: error.message }
  return { success: true }
}
