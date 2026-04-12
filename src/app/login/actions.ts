"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"

export async function signUp(email: string, password: string) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: `${SITE_URL}/login/callback`,
    },
  })

  if (error) {
    console.error("[signUp]", error)
    if (error.message?.includes("already registered")) return { error: "already_registered" }
    if (error.message?.includes("password")) return { error: "password_invalid" }
    return { error: "signup_failed" }
  }

  // Supabase returns user with empty identities when email already exists via OAuth
  if (data.user && data.user.identities?.length === 0) {
    return { error: "email_exists_with_oauth" }
  }

  return { success: true }
}

export async function signIn(email: string, password: string) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })

  if (error) {
    console.error("[signIn]", error)
    if (error.message?.includes("Invalid login")) return { error: "login_failed" }
    if (error.message?.includes("Email not confirmed")) return { error: "email_not_confirmed" }
    return { error: "login_error" }
  }
  return { success: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
