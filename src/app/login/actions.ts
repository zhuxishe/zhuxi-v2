"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export async function signUp(email: string, password: string) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
  })

  if (error) return { error: error.message }
  return { success: true }
}

export async function signIn(email: string, password: string) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })

  if (error) return { error: error.message }
  return { success: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
