"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requirePlayer } from "@/lib/auth/player"
import { resolveQuestionnaireSubmission } from "@/components/player/questionnaire-submit"
import type { QuestionnaireSubmitContext } from "@/components/player/questionnaire-client"
import { parseSupplementary, type SupplementaryDraft } from "@/lib/forms/player-enrichment"

export async function submitSupplementary(data: SupplementaryDraft, context?: QuestionnaireSubmitContext) {
  const player = await requirePlayer()
  try { context = await resolveQuestionnaireSubmission("supplementary", context, data) }
  catch { return { error: "saveFailed" } }
  if (context) {
    try {
      const { savePlayerQuestionnaire } = await import("@/lib/questionnaires/server")
      const saved = await savePlayerQuestionnaire("supplementary", context.versionId, context.answers, { complete: true, expectedRevision: context.revision })
      if (!saved.success) return { error: saved.error }
      for (const path of ["/app", "/app/profile", "/app/profile/supplementary", "/admin", "/admin/members", `/admin/members/${player.memberId}`]) revalidatePath(path)
      return { success: true, questionnaire: saved.runtime }
    } catch { return { error: "saveFailed" } }
  }
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
