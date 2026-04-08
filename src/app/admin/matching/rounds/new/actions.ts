"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"

interface CreateRoundInput {
  roundName: string
  surveyStart: string
  surveyEnd: string
  activityStart: string
  activityEnd: string
}

export async function createRound(input: CreateRoundInput) {
  const admin = await requireAdmin()
  const supabase = await createClient()

  if (!input.roundName.trim()) return { error: "请输入轮次名称" }
  if (!input.surveyStart || !input.surveyEnd) return { error: "请设置问卷时间" }
  if (!input.activityStart || !input.activityEnd) return { error: "请设置活动日期" }

  if (new Date(input.surveyEnd) <= new Date(input.surveyStart)) {
    return { error: "问卷截止时间必须晚于开放时间" }
  }
  if (new Date(input.activityEnd) <= new Date(input.activityStart)) {
    return { error: "活动结束日期必须晚于开始日期" }
  }

  const { data, error } = await supabase
    .from("match_rounds")
    .insert({
      round_name: input.roundName,
      survey_start: input.surveyStart,
      survey_end: input.surveyEnd,
      activity_start: input.activityStart,
      activity_end: input.activityEnd,
      status: "draft",
      created_by: admin.id,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }
  revalidatePath("/admin/matching/rounds")
  revalidatePath("/admin/matching")
  return { roundId: data.id }
}
