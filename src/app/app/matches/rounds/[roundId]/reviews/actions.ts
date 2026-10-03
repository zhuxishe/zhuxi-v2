"use server"

import { revalidatePath } from "next/cache"
import { requirePlayer } from "@/lib/auth/player"
import { activityReviewRpc, activityReviewErrorCode } from "@/lib/activity-reviews/queries"
import { mapActivityReport, mapActivityReview, record } from "@/lib/activity-reviews/mappers"
import { validateReviewSubmission } from "@/lib/activity-reviews/validation"
import type { ActivityReviewActionResult, SubmitActivityReviewInput } from "@/lib/activity-reviews/types"

export async function submitActivityReviewAction(input: SubmitActivityReviewInput): Promise<ActivityReviewActionResult> {
  await requirePlayer()
  const error = validateReviewSubmission(input)
  if (error) return { error }
  try {
    const data = record(input.operation === "edit_report" && input.report ? await activityReviewRpc("player_update_round_peer_report", {
      p_round_id: input.roundId, p_reviewee_id: input.targetMemberId,
      p_category: input.report.category, p_details: input.report.detail.trim(),
      p_expected_version: input.report.expectedVersion, p_request_id: input.requestId ?? null,
    }) : await activityReviewRpc("player_submit_round_peer_feedback", {
      p_round_id: input.roundId, p_reviewee_id: input.targetMemberId,
      p_score: input.review?.score ?? null, p_comment: input.review?.comment.trim() ?? "", p_review_version: input.review?.expectedVersion ?? 0,
      p_report_category: input.report?.category ?? null, p_report_details: input.report?.detail.trim() ?? null, p_report_version: input.report?.expectedVersion ?? 0,
      p_request_id: input.requestId ?? null,
    }))
    revalidatePath("/app")
    revalidatePath("/app/matches")
    revalidatePath(`/app/matches/rounds/${input.roundId}`)
    revalidatePath(`/app/matches/rounds/${input.roundId}/reviews`)
    revalidatePath("/admin/activity-reviews")
    return { success: true, review: data.review ? mapActivityReview(data.review) : null, report: data.report ? mapActivityReport(data.report) : null }
  } catch (error) { return { error: activityReviewErrorCode(error) } }
}
