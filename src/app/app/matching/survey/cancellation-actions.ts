"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requirePlayer } from "@/lib/auth/player"
import { registrationOperationError } from "@/lib/matching/registration-operation"

export async function cancelRegistration(input: { roundId: string; expectedUpdatedAt: string | null }) {
  await requirePlayer()
  if (!input || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.roundId)
    || !Object.hasOwn(input, "expectedUpdatedAt")
    || (input.expectedUpdatedAt !== null && (typeof input.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(input.expectedUpdatedAt))))) {
    return { error: "invalidSurveyInput" }
  }
  const db = await createClient()
  const { error } = await db.rpc("manage_my_registration", {
    p_round_id: input.roundId, p_operation: "cancel", p_expected_updated_at: input.expectedUpdatedAt,
  })
  if (error) {
    console.error("[cancelRegistration]", error)
    return { error: registrationOperationError(error) ?? "saveFailed" }
  }
  revalidatePath("/app", "layout")
  revalidatePath("/app/matching")
  revalidatePath("/app/matching/survey")
  revalidatePath("/app/matches")
  revalidatePath(`/app/matches/rounds/${input.roundId}`)
  revalidatePath(`/admin/matching/rounds/${input.roundId}`)
  return { success: true }
}
