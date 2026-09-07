"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requirePlayer } from "@/lib/auth/player"
import { parseSupplementary, type SupplementaryDraft } from "@/lib/forms/player-enrichment"

export async function submitSupplementary(data: SupplementaryDraft) {
  const player = await requirePlayer()
  const payload = parseSupplementary(data)
  if (!payload) return { error: "invalidProfileInput" }
  const supabase = await createClient()
  // Both sections commit together. The RPC resolves the member from auth.uid().
  const { data: savedMemberId, error } = await supabase.rpc("save_my_supplementary", { p_data: { ...payload } })
  if (error || savedMemberId !== player.memberId) return { error: "saveFailed" }

  revalidatePath("/app")
  revalidatePath("/app/profile")
  revalidatePath("/app/profile/supplementary")
  revalidatePath("/admin")
  revalidatePath("/admin/members")
  revalidatePath(`/admin/members/${player.memberId}`)
  return { success: true }
}
