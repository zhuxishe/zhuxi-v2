"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { parseSurveyOpening } from "@/lib/matching/survey-opening"
import { isRoundDate } from "@/lib/matching/round-config-validation"
import { isRoundSetupError, ROUND_SETUP_ERROR } from "@/lib/matching/round-config"
import type { RoundPurpose } from "@/types/matching-round"

interface CreateRoundInput {
  roundName: string
  surveyStart: string
  surveyEnd: string
  activityStart: string
  activityEnd: string
  purpose?: RoundPurpose
}

export async function createRound(input: CreateRoundInput) {
  const admin = await requireAdmin()
  const supabase = await createClient()

  if (!input.roundName.trim() || input.roundName.length > 160) return { error: "请输入轮次名称（最多 160 字）" }
  if (!input.surveyStart || !input.surveyEnd) return { error: "请设置问卷时间" }
  if (!input.activityStart || !input.activityEnd) return { error: "请设置活动日期" }

  const parsed = parseSurveyOpening(input)
  if (parsed.error) return { error: parsed.error }
  if (!isRoundDate(input.activityStart) || !isRoundDate(input.activityEnd) || input.activityEnd < input.activityStart) {
    return { error: "活动结束日期不能早于开始日期" }
  }
  const purpose = input.purpose ?? "matching"
  if (!["matching", "registration", "announcement"].includes(purpose)) return { error: "请选择有效的用途" }

  const { data, error } = await supabase
    .from("match_rounds")
    .insert({
      round_name: input.roundName.trim(),
      ...(purpose === "matching" ? {} : { purpose }),
      ...parsed.window,
      activity_start: input.activityStart,
      activity_end: input.activityEnd,
      status: "draft",
      created_by: admin.id,
    })
    .select("*")
    .single()

  if (error) {
    if (isRoundSetupError(error)) return { error: ROUND_SETUP_ERROR }
    console.error("[createRound]", error)
    return { error: "操作失败" }
  }
  revalidatePath("/admin/matching/rounds")
  revalidatePath("/admin/matching")
  return { roundId: data.id, contentSupported: Object.hasOwn(data, "config_revision") }
}
