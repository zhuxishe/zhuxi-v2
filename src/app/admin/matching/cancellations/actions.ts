"use server"

import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import { matchingPublicationError } from "@/lib/matching/publication-errors"

async function reviewCancellation(
  operation: "admin_approve_matching_cancellation" | "admin_reject_matching_cancellation",
  resultId: string,
  rawReason: string,
  expectedPublicationVersion: number,
  expectedRequestedAt: string | null,
) {
  await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  if (!Number.isSafeInteger(expectedPublicationVersion) || expectedPublicationVersion < 0) {
    return { error: "发布版本无效，请刷新后重试" }
  }
  if (typeof expectedRequestedAt !== "string" || expectedRequestedAt.length === 0) {
    return { error: "取消申请版本无效，请刷新后重试" }
  }
  const supabase = await createClient()
  // Approval only cancels this pair/group; other published results stay available.
  // The RPC checks the pending request and publication version in one transaction.
  const { error } = await supabase.rpc(operation, {
    p_result_id: resultId,
    p_reason: reasonResult.reason,
    p_expected_publication_version: expectedPublicationVersion,
    p_expected_requested_at: expectedRequestedAt,
  })
  if (error) {
    console.error(`[${operation}]`, error)
    return { error: matchingPublicationError(error, "审批失败，请刷新后重试") }
  }

  revalidatePath("/admin/matching", "layout")
  revalidatePath("/app/matches", "layout")
  revalidatePath("/app", "layout")
  return { success: true }
}

export async function approveCancellation(resultId: string, rawReason: string, expectedPublicationVersion: number, expectedRequestedAt: string | null) {
  return reviewCancellation("admin_approve_matching_cancellation", resultId, rawReason, expectedPublicationVersion, expectedRequestedAt)
}

export async function rejectCancellation(resultId: string, rawReason: string, expectedPublicationVersion: number, expectedRequestedAt: string | null) {
  return reviewCancellation("admin_reject_matching_cancellation", resultId, rawReason, expectedPublicationVersion, expectedRequestedAt)
}
