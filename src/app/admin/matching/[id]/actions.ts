"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"

export async function lockPair(resultId: string) {
  const admin = await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from("match_results")
    .update({
      status: "locked",
      locked_by: admin.id,
      locked_at: new Date().toISOString(),
    })
    .eq("id", resultId)

  if (error) return { error: error.message }
  revalidatePath("/admin/matching", "layout")
  return { success: true }
}

export async function splitPair(resultId: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from("match_results")
    .update({ status: "cancelled" })
    .eq("id", resultId)

  if (error) return { error: error.message }
  revalidatePath("/admin/matching", "layout")
  return { success: true }
}

export async function restorePair(resultId: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from("match_results")
    .update({ status: "draft", locked_by: null, locked_at: null })
    .eq("id", resultId)

  if (error) return { error: error.message }
  revalidatePath("/admin/matching", "layout")
  return { success: true }
}

export async function confirmSession(sessionId: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { error: sErr } = await supabase
    .from("match_sessions")
    .update({ status: "confirmed" })
    .eq("id", sessionId)

  if (sErr) return { error: sErr.message }

  const { error: rErr } = await supabase
    .from("match_results")
    .update({ status: "confirmed" })
    .eq("session_id", sessionId)
    .eq("status", "draft")

  if (rErr) return { error: rErr.message }
  revalidatePath(`/admin/matching/${sessionId}`)
  return { success: true }
}
