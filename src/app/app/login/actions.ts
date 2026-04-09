"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { redirect } from "next/navigation"

export async function sendMagicLink(email: string) {
  if (!email?.trim()) return { error: "emailRequired" }

  const supabase = await createClient()

  // Verify this email belongs to an approved member
  const { data: member } = await supabase
    .from("members")
    .select("id, status")
    .eq("email", email.trim().toLowerCase())
    .single()

  if (!member) {
    return { error: "emailNotRegistered" }
  }

  if (member.status !== "approved") {
    return { error: "accountNotApproved" }
  }

  // Send magic link
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/app/login/callback`,
    },
  })

  if (error) {
    console.error("[sendMagicLink]", error)
    return { error: "sendFailed" }
  }
  return { success: true }
}

export async function handleAuthCallback() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/app/login")

  // Link auth user to member record (if not already linked)
  const { data: member } = await supabase
    .from("members")
    .select("id, user_id")
    .eq("email", user.email ?? "")
    .single()

  if (member && !member.user_id) {
    const admin = createAdminClient()
    await admin
      .from("members")
      .update({ user_id: user.id })
      .eq("id", member.id)
      .is("user_id", null)
  }

  redirect("/app")
}
