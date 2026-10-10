"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { activityReviewRpc, activityReviewErrorCode } from "@/lib/activity-reviews/queries"
import { validateReviewSettings, validateReviewRoster, validateModerateReview, validateModerateReport } from "@/lib/activity-reviews/validation"
import type { ActivityReviewActionResult, SaveActivityReviewSettingsInput, ConfirmActivityReviewRosterInput, ModerateActivityReviewInput, ModerateActivityReportInput } from "@/lib/activity-reviews/types"

async function mutate(roundId: string, rpc: string, args: Record<string, unknown>): Promise<ActivityReviewActionResult> {
  try {
    await activityReviewRpc(rpc, args)
    revalidatePath("/admin/activity-reviews")
    revalidatePath(`/admin/matching/rounds/${roundId}`)
    revalidatePath("/app")
    revalidatePath("/app/matches")
    revalidatePath(`/app/matches/rounds/${roundId}`)
    revalidatePath(`/app/matches/rounds/${roundId}/reviews`)
    if (rpc === "admin_confirm_round_peer_review_roster") {
      revalidatePath("/admin/matching")
      revalidatePath("/app/matching")
      revalidatePath("/app/matching/survey")
      revalidatePath("/app/community/notifications")
    }
    return { success: true }
  } catch (error) { return { error: activityReviewErrorCode(error) } }
}
export async function saveActivityReviewSettingsAction(input: SaveActivityReviewSettingsInput) {
  await requireAdmin()
  const error = validateReviewSettings(input)
  if (error) return { error }
  return mutate(input.roundId, "admin_save_round_peer_review_settings", { p_round_id: input.roundId, p_enabled: input.enabled, p_opens_at: input.opensAt, p_closes_at: input.closesAt, p_expected_version: input.expectedVersion, p_reason: input.reason.trim() })
}
export async function confirmActivityReviewRosterAction(input: ConfirmActivityReviewRosterInput) {
  await requireAdmin()
  const error = validateReviewRoster(input)
  if (error) return { error }
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
