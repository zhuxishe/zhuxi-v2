"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requirePlayer } from "@/lib/auth/player"
import { parsePersonality, type PersonalityDraft } from "@/lib/forms/player-enrichment"

export async function submitPersonality(data: PersonalityDraft) {
  const player = await requirePlayer()
  const payload = parsePersonality(data)
  if (!payload) return { error: "incompletePersonality" }
  const supabase = await createClient()

  const { data: saved, error } = await supabase
    .from("member_personality")
    .upsert({
      member_id: player.memberId,
      ...payload,
    }, { onConflict: "member_id" })
    .select("member_id")
    .single()

  if (error || saved?.member_id !== player.memberId) {
    console.error("[submitPersonality]", error?.code ?? "missing_saved_member")
    return { error: "saveFailed" }
  }
  revalidatePath("/app")
  revalidatePath("/app/profile")
  revalidatePath("/app/profile/personality")
  revalidatePath("/admin")
  revalidatePath("/admin/members")
  revalidatePath(`/admin/members/${player.memberId}`)
  return { success: true }
}
