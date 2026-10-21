"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requirePlayer } from "@/lib/auth/player"
import { resolveQuestionnaireSubmission } from "@/components/player/questionnaire-submit"
import type { QuestionnaireSubmitContext } from "@/components/player/questionnaire-client"
import { parsePersonality, type PersonalityDraft } from "@/lib/forms/player-enrichment"

export async function submitPersonality(data: PersonalityDraft, context?: QuestionnaireSubmitContext) {
  const player = await requirePlayer()
  try { context = await resolveQuestionnaireSubmission("personality", context, data) }
  catch { return { error: "saveFailed" } }
  if (context) {
    try {
      const { savePlayerQuestionnaire } = await import("@/lib/questionnaires/server")
      const saved = await savePlayerQuestionnaire("personality", context.versionId, context.answers, { complete: true, expectedRevision: context.revision })
      if (!saved.success) return { error: saved.error }
      for (const path of ["/app", "/app/profile", "/app/profile/personality", "/admin", "/admin/members", `/admin/members/${player.memberId}`]) revalidatePath(path)
      return { success: true, questionnaire: saved.runtime }
    } catch { return { error: "saveFailed" } }
  }
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
