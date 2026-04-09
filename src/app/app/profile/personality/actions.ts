"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requirePlayer } from "@/lib/auth/player"
import type { PersonalitySelfData } from "@/types"

export async function submitPersonality(data: PersonalitySelfData) {
  const player = await requirePlayer()
  const supabase = await createClient()

  const { error } = await supabase
    .from("member_personality")
    .upsert({
      member_id: player.memberId,
      extroversion: data.extroversion,
      initiative: data.initiative,
      expression_style_tags: data.expression_style_tags,
      group_role_tags: data.group_role_tags,
      warmup_speed: data.warmup_speed,
      planning_style: data.planning_style,
      coop_compete_tendency: data.coop_compete_tendency,
      emotional_stability: data.emotional_stability,
      boundary_strength: data.boundary_strength,
      reply_speed: data.reply_speed,
    }, { onConflict: "member_id" })

  if (error) return { error: error.message }
  revalidatePath("/app/profile")
  return { success: true }
}
