"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export async function sendMagicLink(email: string) {
  if (!email?.trim()) return { error: "请输入邮箱地址" }

  const supabase = await createClient()

  // Verify this email belongs to an approved member
  const { data: member } = await supabase
    .from("members")
    .select("id, status")
    .eq("email", email.trim().toLowerCase())
    .single()

  if (!member) {
    return { error: "此邮箱未注册，请联系管理员" }
  }

  if (member.status !== "approved") {
    return { error: "账号尚未通过审核，请联系管理员" }
  }

  // Send magic link
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/app/login/callback`,
    },
  })

  if (error) return { error: error.message }
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
    .eq("email", user.email)
    .single()

  if (member && !member.user_id) {
    await supabase
      .from("members")
      .update({ user_id: user.id })
      .eq("id", member.id)
  }

  redirect("/app")
}
