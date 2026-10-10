"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requirePlayer } from "@/lib/auth/player"
import { surveySubmissionError } from "@/lib/matching/survey-window"
import { getRoundPurpose, normalizeRoundConfig } from "@/lib/matching/round-config"
import { validateSurveyAnswers } from "@/lib/matching/survey-answers"
import type { SurveyAnswers } from "@/types/matching-round"
import { registrationOperationError } from "@/lib/matching/registration-operation"

interface SubmitSurveyInput extends Omit<SurveyAnswers, "customAnswers"> {
  roundId: string
  configRevision?: number
  customAnswers?: SurveyAnswers["customAnswers"]
  registrationIntent?: "create" | "update" | "rejoin"
  expectedUpdatedAt?: string | null
}

export async function submitSurvey(input: SubmitSurveyInput) {
  const player = await requirePlayer()
  if (!input || typeof input.roundId !== "string") return { error: "invalidSurveyInput" }
  const supabase = await createClient()
  // Selecting the full row also permits unchanged legacy matching while a schema upgrade is pending.
  const { data: round, error: roundErr } = await supabase.from("match_rounds").select("*").eq("id", input.roundId).single()
  if (roundErr || !round || round.deleted_at) {
    if (roundErr) console.error("[submitSurvey] round query", roundErr)
    return { error: "roundNotFound" }
  }
  const windowError = surveySubmissionError(round)
  if (windowError) return { error: windowError }
  if ((input.configRevision ?? 0) !== (round.config_revision ?? 0)) return { error: "surveyUpdated" }
  const validated = validateSurveyAnswers(input, getRoundPurpose(round.purpose), normalizeRoundConfig(round.content_config),
    round.activity_start, round.activity_end)
  if (!validated.data) return { error: validated.error }
  const answers = validated.data
  const contentFields = Object.hasOwn(round, "config_revision")
    ? { custom_answers: answers.customAnswers, config_revision: round.config_revision } : {}
  if (round.purpose === "registration" && (
    (input.registrationIntent !== undefined && !["create", "update", "rejoin"].includes(input.registrationIntent))
    || (input.registrationIntent && input.registrationIntent !== "create" && !Object.hasOwn(input, "expectedUpdatedAt"))
    || (input.expectedUpdatedAt != null && (typeof input.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(input.expectedUpdatedAt))))
  )) return { error: "invalidSurveyInput" }
  const { error } = round.purpose === "registration" ? await supabase.rpc("manage_my_registration", {
    p_round_id: input.roundId, p_operation: input.registrationIntent ?? "create",
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
    p_config_revision: input.configRevision ?? 0, p_custom_answers: answers.customAnswers,
  }) : await supabase.from("match_round_submissions").upsert({
    round_id: input.roundId, member_id: player.memberId,
    game_type_pref: answers.gameTypePref, gender_pref: answers.genderPref,
    availability: answers.availability, interest_tags: answers.interestTags,
    social_style: answers.socialStyle, message: answers.message, ...contentFields,
  }, { onConflict: "round_id,member_id" })

  if (error) {
    console.error("[submitSurvey] upsert", error)
    const registrationError = registrationOperationError(error)
    if (registrationError && registrationError !== "registrationCancelUnavailable") return { error: registrationError }
    // Explain admin closure or content changes which raced with the initial read.
    const { data: current, error: currentQueryError } = await supabase.from("match_rounds").select("*").eq("id", input.roundId).maybeSingle()
    if (current?.deleted_at || !current && !currentQueryError) return { error: "roundNotFound" }
    const currentError = current ? surveySubmissionError(current) : null
    if (currentError) return { error: currentError }
    if (current && (current.config_revision ?? 0) !== (input.configRevision ?? 0)) return { error: "surveyUpdated" }
    if (current?.purpose === "announcement") return { error: "surveyReadOnly" }
    if (registrationError === "registrationCancelUnavailable") return { error: "surveyClosed" }
    return { error: "saveFailed" }
  }
  revalidatePath("/app", "layout")
  revalidatePath("/app/matching/survey")
  revalidatePath("/app/matching")
  revalidatePath("/app/matches")
  revalidatePath(`/admin/matching/rounds/${input.roundId}`)
  return { success: true }
}
