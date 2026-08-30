"use server"

import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"

export async function approveCancellation(resultId: string, rawReason: string) {
  const admin = await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const supabase = await createClient()

  const { error } = await supabase
    .from("match_results")
    .update({
      status: "cancelled",
      cancellation_status: "approved",
      cancellation_reviewed_by: admin.id,
      cancellation_reviewed_at: new Date().toISOString(),
      audit_reason: reasonResult.reason,
    })
    .eq("id", resultId)
    .eq("cancellation_status", "pending")

  if (error) {
    console.error("[approveCancellation]", error)
    return { error: "操作失败" }
  }

  revalidatePath("/admin/matching/cancellations")
  revalidatePath("/admin/matching")
  revalidatePath("/app/matches")
  return { success: true }
}

export async function rejectCancellation(resultId: string, rawReason: string) {
  const admin = await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const supabase = await createClient()

  const { error } = await supabase
    .from("match_results")
    .update({
      cancellation_status: "rejected",
      cancellation_reviewed_by: admin.id,
      cancellation_reviewed_at: new Date().toISOString(),
      audit_reason: reasonResult.reason,
    })
    .eq("id", resultId)
    .eq("cancellation_status", "pending")

  if (error) {
    console.error("[rejectCancellation]", error)
    return { error: "操作失败" }
  }

  revalidatePath("/admin/matching/cancellations")
  revalidatePath("/admin/matching")
  return { success: true }
}
