"use server"

import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function approveCancellation(resultId: string) {
  const admin = await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from("match_results")
    .update({
      status: "cancelled",
      cancellation_status: "approved",
      cancellation_reviewed_by: admin.id,
      cancellation_reviewed_at: new Date().toISOString(),
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

export async function rejectCancellation(resultId: string) {
  const admin = await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from("match_results")
    .update({
      cancellation_status: "rejected",
      cancellation_reviewed_by: admin.id,
      cancellation_reviewed_at: new Date().toISOString(),
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
