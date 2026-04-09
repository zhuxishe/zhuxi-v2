"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"

export async function signUp(email: string, password: string) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: `${SITE_URL}/login/callback`,
    },
  })

  if (error) {
    console.error("[signUp]", error)
    if (error.message?.includes("already registered")) return { error: "该邮箱已注册" }
    if (error.message?.includes("password")) return { error: "密码不符合要求（至少6位）" }
    return { error: "注册失败，请稍后重试" }
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
    if (error.message?.includes("Invalid login")) return { error: "邮箱或密码错误" }
    if (error.message?.includes("Email not confirmed")) return { error: "请先验证邮箱" }
    return { error: "登录失败，请稍后重试" }
  }
  return { success: true }
}

export async function signInWithGoogle() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${SITE_URL}/login/callback`,
      queryParams: { prompt: "consent select_account" },
    },
  })

  if (error) {
    console.error("[signInWithGoogle]", error)
    return { error: "Google 登录失败，请稍后重试" }
  }
  if (data.url) redirect(data.url)
  return { success: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
