"use server"

import { createClient } from "@/lib/supabase/server"
import {
  ensureMyMemberRecord,
  getMemberMasterDiagnostic,
} from "@/lib/member-master/rpc"
import { buildPublicUrl } from "@/lib/site-url"
import { redirect } from "next/navigation"

export async function sendMagicLink(email: string) {
  if (!email?.trim()) return { error: "emailRequired" }

  const supabase = await createClient()

  // Deprecated compatibility action. Never infer Auth ownership or approval
  // from members.email: an unbound legacy row is not the current Auth user.
  // Existing Auth users may continue through the canonical callback, while
  // new users must use the current registration flow at /login.
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      emailRedirectTo: buildPublicUrl("/login/callback"),
      shouldCreateUser: false,
    },
  })

  if (error) {
    console.error("[legacy magic link] failed:", error.code ?? "UNKNOWN")
    return { error: "sendFailed" }
  }
  return { success: true }
}

export async function handleAuthCallback() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  try {
    // Legacy callback compatibility. Ownership is established only through
    // auth.uid(); an email match must never claim an unbound legacy member.
    await ensureMyMemberRecord(supabase)
  } catch (error) {
    console.error(
      "[legacy login callback] member master failed:",
      getMemberMasterDiagnostic(error)
    )
    redirect("/login?error=oauth_failed")
  }

  redirect("/app")
}
