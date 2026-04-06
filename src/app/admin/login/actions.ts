"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"

export async function signInWithGoogleAdmin() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${SITE_URL}/admin/login/callback`,
      queryParams: { prompt: "consent select_account" },
    },
  })

  if (error) return { error: error.message }
  if (data.url) redirect(data.url)
  return { success: true }
}

export async function loginAdmin(formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) {
    return { error: "请输入邮箱和密码" }
  }

  const supabase = await createClient()

  const { error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (authError) {
    return { error: "邮箱或密码错误" }
  }

  // Verify this user is an admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "认证失败" }

  const { data: admin } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!admin) {
    await supabase.auth.signOut()
    return { error: "你不是管理员" }
  }

  redirect("/admin")
}

export async function logoutAdmin() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/admin/login")
}
