"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRoundPurpose, isRoundSetupError, normalizeRoundConfig, roundAnswerStructure, ROUND_SETUP_ERROR } from "@/lib/matching/round-config"
import { validateRoundDraft, validateRoundPublishing } from "@/lib/matching/round-config-validation"
import { parseSurveyOpening } from "@/lib/matching/survey-opening"
import type { RoundContentDraft } from "@/types/matching-round"
import type { Json } from "@/types/database.types"

export async function saveRoundContent(roundId: string, expectedRevision: number, draft: RoundContentDraft) {
  await requireAdmin()
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return { error: "配置版本无效，请刷新页面" }
  const validated = validateRoundDraft(draft)
  if (validated.error || !validated.config) return { error: validated.error ?? "内容配置无效" }
  const parsed = parseSurveyOpening(draft, new Date(0))
  if (parsed.error) return { error: parsed.error }
  const db = await createClient()
  const { data: round, error } = await db.from("match_rounds").select("*").eq("id", roundId).single()
  if (error || !round || round.deleted_at) return { error: "轮次不存在或已删除" }
  if (!("config_revision" in round)) return { error: ROUND_SETUP_ERROR }
  if (round.config_revision !== expectedRevision) return { error: "内容已被其他管理员修改，请刷新后重试" }
  if (round.status === "open") {
    const opening = parseSurveyOpening(draft)
    if (opening.error) return { error: opening.error }
    const publishingError = validateRoundPublishing(draft.purpose, validated.config)
    if (publishingError) return { error: publishingError }
  }
  if (draft.purpose === "registration" && validated.config.eventStart && Date.parse(parsed.window.survey_end) > Date.parse(validated.config.eventStart)) return { error: "报名截止时间不能晚于活动开始时间" }
  const { count, error: countError } = await createAdminClient().from("match_round_submissions").select("id", { count: "exact", head: true }).eq("round_id", roundId)
  if (countError) return { error: "无法确认已有回答，请稍后重试" }
  const structureChanged = getRoundPurpose(round.purpose) !== draft.purpose
    || round.activity_start !== draft.activityStart || round.activity_end !== draft.activityEnd
    || roundAnswerStructure(getRoundPurpose(round.purpose), normalizeRoundConfig(round.content_config)) !== roundAnswerStructure(draft.purpose, validated.config)
  if (structureChanged && ((count ?? 0) > 0 || round.status === "matched")) return { error: "已有回答或匹配结果，不能修改用途、活动时间或问题结构；请复制为新一期" }
  const { data: changed, error: updateError } = await db.from("match_rounds").update({
    round_name: draft.roundName.trim(), purpose: draft.purpose, content_config: validated.config as unknown as Json,
    ...parsed.window, activity_start: draft.activityStart, activity_end: draft.activityEnd,
  }).eq("id", roundId).eq("config_revision", expectedRevision).select("config_revision").maybeSingle()
  if (updateError) {
    if (isRoundSetupError(updateError)) return { error: ROUND_SETUP_ERROR }
    if (updateError.message.includes("ROUND_DELETED") || updateError.message.includes("ROUND_NOT_FOUND")) return { error: "轮次已删除，请返回匹配管理" }
    if (updateError.message.includes("ROUND_STRUCTURE_LOCKED")) return { error: "已有新回答，问题结构已锁定，请刷新或复制为新一期" }
    console.error("[saveRoundContent]", updateError)
    return { error: "内容保存失败，请检查时间及问题设置后重试" }
  }
  if (!changed) return { error: "内容已被其他管理员修改，请刷新后重试" }
  for (const path of ["/app", "/app/matching", "/app/matching/survey", "/admin/matching", `/admin/matching/rounds/${roundId}`, `/admin/matching/rounds/${roundId}/edit`]) revalidatePath(path)
  return { revision: changed.config_revision }
}

export async function copyRound(roundId: string) {
  const admin = await requireAdmin()
  const db = await createClient()
  const { data: round, error } = await db.from("match_rounds").select("*").eq("id", roundId).single()
  if (error || !round || round.deleted_at) return { error: "轮次不存在或已删除" }
  if (!("config_revision" in round)) return { error: ROUND_SETUP_ERROR }
  const { data: copy, error: copyError } = await db.from("match_rounds").insert({
    round_name: `${round.round_name.slice(0, 150)}（副本）`, purpose: round.purpose,
    content_config: round.content_config, survey_start: round.survey_start,
    survey_end: round.survey_end,
    activity_start: round.activity_start, activity_end: round.activity_end, status: "draft", created_by: admin.id,
  }).select("id").single()
  if (copyError || !copy) return { error: isRoundSetupError(copyError) ? ROUND_SETUP_ERROR : "复制失败，请稍后重试" }
  revalidatePath("/admin/matching")
  return { roundId: copy.id }
}
