"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { activityReviewRpc, activityReviewErrorCode } from "@/lib/activity-reviews/queries"
import { isReviewUuid, validReviewReason, validateReviewSettings, validateReviewRoster, validateModerateReview, validateModerateReport } from "@/lib/activity-reviews/validation"
import type { ActivityReviewActionResult, SaveActivityReviewSettingsInput, ConfirmActivityReviewRosterInput, ModerateActivityReviewInput, ModerateActivityReportInput } from "@/lib/activity-reviews/types"
import { validateReviewExemption, type SetReviewExemptionInput } from "@/lib/activity-reviews/requirements"
import type { RestoreReviewRegistrationInput } from "@/lib/activity-reviews/restore-registration-types"

async function mutate(roundId: string, rpc: string, args: Record<string, unknown>): Promise<ActivityReviewActionResult> {
  try {
    await activityReviewRpc(rpc, args)
    revalidatePath("/admin/activity-reviews")
    revalidatePath(`/admin/matching/rounds/${roundId}`)
    revalidatePath("/app")
    revalidatePath("/app/matches")
    revalidatePath(`/app/matches/rounds/${roundId}`)
    revalidatePath(`/app/matches/rounds/${roundId}/reviews`)
    if (rpc === "admin_set_round_review_exemption" || rpc === "admin_save_round_peer_review_settings") {
      revalidatePath("/app", "layout")
      revalidatePath("/app/matching/survey")
    }
    if (rpc === "admin_confirm_round_peer_review_roster" || rpc === "admin_restore_unified_review_registration") {
      revalidatePath("/admin/matching")
      revalidatePath("/app/matching")
      revalidatePath("/app/matching/survey")
      revalidatePath("/app/community/notifications")
    }
    return { success: true }
  } catch (error) { return { error: activityReviewErrorCode(error) } }
}
export async function restoreReviewRegistrationAction(input: RestoreReviewRegistrationInput) {
  await requireAdmin()
  if (!input || !isReviewUuid(input.roundId) || !isReviewUuid(input.memberId)) return { error: "PEER_INVALID_INPUT" }
  if (!validReviewReason(input.reason)) return { error: "PEER_REASON_REQUIRED" }
  return mutate(input.roundId, "admin_restore_unified_review_registration", {
    p_round_id: input.roundId, p_member_id: input.memberId, p_reason: input.reason.trim(),
  })
}
export async function saveActivityReviewSettingsAction(input: SaveActivityReviewSettingsInput) {
  await requireAdmin()
  const error = validateReviewSettings(input)
  if (error) return { error }
  return mutate(input.roundId, "admin_save_round_peer_review_settings", { p_round_id: input.roundId, p_enabled: input.enabled, p_opens_at: input.opensAt, p_closes_at: input.closesAt, p_expected_version: input.expectedVersion, p_reason: input.reason.trim(), ...(input.autoIncludeRegistered === undefined ? {} : { p_auto_include_registered: input.autoIncludeRegistered }) })
}
export async function confirmActivityReviewRosterAction(input: ConfirmActivityReviewRosterInput) {
  await requireAdmin()
  const error = validateReviewRoster(input, true)
  if (error) return { error }
  if (input.memberIds.length < 2) {
    // The stored activity version, never a client-supplied flag, controls this
    // exception. Existing activities retain the two-participant minimum.
    try {
      const context = await activityReviewRpc("admin_get_round_peer_reviews", { p_round_id: input.roundId })
      const settings = context && typeof context === "object" && "settings" in context ? context.settings : null
      if (!settings || typeof settings !== "object" || !("review_system" in settings) || settings.review_system !== "unified") {
        return { error: "PEER_INVALID_INPUT" }
      }
    } catch (readError) { return { error: activityReviewErrorCode(readError) } }
  }
  return mutate(input.roundId, "admin_confirm_round_peer_review_roster", { p_round_id: input.roundId, p_member_ids: input.memberIds, p_expected_version: input.expectedVersion, p_reason: input.reason.trim() })
}
export async function moderateActivityReviewAction(input: ModerateActivityReviewInput) {
  await requireAdmin()
  const error = validateModerateReview(input)
  if (error) return { error }
  return mutate(input.roundId, "admin_moderate_round_peer_review", { p_review_id: input.reviewId, p_valid: input.valid, p_expected_version: input.expectedVersion, p_reason: input.reason.trim() })
}
export async function moderateActivityReportAction(input: ModerateActivityReportInput) {
  await requireAdmin()
  const error = validateModerateReport(input)
  if (error) return { error }
  return mutate(input.roundId, "admin_resolve_round_peer_report", { p_report_id: input.reportId, p_status: input.status, p_internal_note: input.internalNote.trim(), p_expected_version: input.expectedVersion, p_reason: input.reason.trim() })
}
export async function setActivityReviewExemptionAction(input: SetReviewExemptionInput) {
  await requireAdmin()
  const error = validateReviewExemption(input)
  if (error) return { error }
  return mutate(input.roundId, "admin_set_round_review_exemption", {
    p_round_id: input.roundId, p_member_id: input.memberId, p_exempt: input.exempt,
    p_reason: input.reason.trim(), p_expected_version: input.expectedVersion,
  })
}
