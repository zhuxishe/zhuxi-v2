"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"
import { canUpdateRoundStatus } from "@/components/admin/round-detail-rules"
import { parseSurveyOpening, type SurveyOpeningInput } from "@/lib/matching/survey-opening"
import { normalizeRoundConfig } from "@/lib/matching/round-config"
import { validateRoundPublishing } from "@/lib/matching/round-config-validation"

export async function updateRoundStatus(roundId: string, status: string, opening?: SurveyOpeningInput) {
  await requireAdmin()
  if (!["draft", "open", "closed"].includes(status)) return { error: "轮次状态无效" }
  const supabase = await createClient()
  const { data: round, error: roundError } = await supabase.from("match_rounds")
    .select("*").eq("id", roundId).single()
  if (roundError || !round) return { error: "轮次不存在" }
  if (!canUpdateRoundStatus(round.status, status)) return { error: "该轮次已匹配或状态无效，无法更改问卷状态" }

  let window: { survey_start: string; survey_end: string } | undefined
  if (status === "open") {
    if (!opening) return { error: "请确认问卷开放时间和截止时间" }
    const parsed = parseSurveyOpening(opening)
    if (parsed.error) return { error: parsed.error }
    window = parsed.window
    const publishingError = validateRoundPublishing(round.purpose, normalizeRoundConfig(round.content_config))
    if (publishingError) return { error: publishingError }
    if (round.purpose === "registration" && Date.parse(window.survey_end) > Date.parse(normalizeRoundConfig(round.content_config).eventStart)) return { error: "报名截止时间不能晚于活动开始时间" }
    const { data: session, error } = await supabase.from("match_sessions")
      .select("id").eq("round_id", roundId).limit(1).maybeSingle()
    if (error) return { error: "无法确认匹配状态，请稍后重试" }
    if (session) return { error: "该轮次已有匹配记录或正在运行匹配，无法重新开放" }
  }

  // Compare the status and dates read above to avoid overwriting another administrator.
  const { data: changed, error } = await supabase.from("match_rounds")
    .update({ status, ...window }).eq("id", roundId).eq("status", round.status)
    .eq("survey_start", round.survey_start).eq("survey_end", round.survey_end)
    .select("id").maybeSingle()
  if (error) {
    console.error("[updateRoundStatus]", error)
    return { error: "操作失败，请稍后重试" }
  }
  if (!changed) return { error: "轮次状态或时间已变更，请刷新后重试" }
  for (const path of ["/app", "/app/matching/survey", "/admin/matching", `/admin/matching/rounds/${roundId}`]) {
    revalidatePath(path)
  }
  return { success: true }
}
