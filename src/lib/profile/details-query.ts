import { redirect, unstable_rethrow } from "next/navigation"
import { requireMemberRecord, requirePlayer } from "@/lib/auth/player"
import { createClient } from "@/lib/supabase/server"
import type { PlayerProfileDetails } from "./details"

function oneRecord(value: unknown): Record<string, unknown> | null {
  const record = Array.isArray(value) ? value[0] : value
  return record && typeof record === "object" && !Array.isArray(record)
    ? record as Record<string, unknown>
    : null
}

/** Read only the signed-in player's submitted fields, without form defaults. */
export async function fetchMyProfileDetails(): Promise<PlayerProfileDetails> {
  const player = await requireProfileReader()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("members")
    .select(`
      id,
      member_identity (
        full_name, nickname, gender, age_range, nationality, current_city,
        school_name, department, degree_level, course_language, enrollment_year,
        hobby_tags, activity_type_tags, personality_self_tags, taboo_tags
      ),
      member_language (communication_language_pref, japanese_level),
      member_interests (
        activity_area, nearest_station, graduation_year, game_type_pref,
        scenario_mode_pref, scenario_theme_tags, ideal_group_size, script_preference,
        non_script_preference, activity_frequency, preferred_time_slots, budget_range,
        travel_radius, social_goal_primary, social_goal_secondary, accept_beginners, accept_cross_school
      ),
      member_personality (
        extroversion, initiative, expression_style_tags, group_role_tags, warmup_speed,
        planning_style, coop_compete_tendency, emotional_stability, boundary_strength, reply_speed
      ),
      personality_quiz_results (score_e, score_a, score_o, score_c, score_n, personality_type, completed_at)
    `)
    .eq("id", player.memberId)
    .single()

  if (error) throw error
  if (!data) throw new Error("Player profile details were not returned")
  return {
    identity: oneRecord(data.member_identity),
    language: oneRecord(data.member_language),
    interests: oneRecord(data.member_interests),
    personality: oneRecord(data.member_personality),
    quiz: oneRecord(data.personality_quiz_results),
  }
}

export async function requireProfileReader() {
  const player = await requireMemberRecord()
  if (player.accountStatus !== "active" || player.status === "inactive") redirect("/app/inactive")
  if (player.status === "approved") return requirePlayer()
  if (
    !["pending", "rejected"].includes(player.status)
    || !player.hasIdentity
    || player.onboardingStep !== 4
    || !["submitted", "complete"].includes(player.profileStage)
  ) redirect("/app")
  return player
}

export async function loadMyProfileDetails(): Promise<PlayerProfileDetails | null> {
  try {
    return await fetchMyProfileDetails()
  } catch (error) {
    unstable_rethrow(error)
    console.error("[profile details unavailable]", {
      code: error && typeof error === "object" && "code" in error ? error.code : "PROFILE_DETAILS_FAILED",
    })
    return null
  }
}
