"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requirePlayer } from "@/lib/auth/player"
import type { SupplementaryFormData } from "@/types"

export async function submitSupplementary(data: SupplementaryFormData) {
  const player = await requirePlayer()
  const supabase = await createClient()
  const memberId = player.memberId

  // Upsert member_language
  const { error: langError } = await supabase
    .from("member_language")
    .upsert({
      member_id: memberId,
      communication_language_pref: data.communication_language_pref,
      japanese_level: data.japanese_level,
    }, { onConflict: "member_id" })

  if (langError) return { error: langError.message }

  // Upsert member_interests
  const { error: intError } = await supabase
    .from("member_interests")
    .upsert({
      member_id: memberId,
      activity_area: data.activity_area,
      nearest_station: data.nearest_station,
      graduation_year: data.graduation_year,
      game_type_pref: data.game_type_pref,
      scenario_mode_pref: data.scenario_mode_pref,
      scenario_theme_tags: data.scenario_theme_tags,
      ideal_group_size: data.ideal_group_size,
      script_preference: data.script_preference,
      non_script_preference: data.non_script_preference,
      activity_frequency: data.activity_frequency,
      preferred_time_slots: data.preferred_time_slots,
      budget_range: data.budget_range,
      travel_radius: data.travel_radius,
      social_goal_primary: data.social_goal_primary,
      social_goal_secondary: data.social_goal_secondary,
      accept_beginners: data.accept_beginners,
      accept_cross_school: data.accept_cross_school,
    }, { onConflict: "member_id" })

  if (intError) return { error: intError.message }

  revalidatePath("/app/profile")
  return { success: true }
}
