import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import type { AdminUser } from "@/types"

/** Check if current user is an admin. Redirects to /admin/login if not. */
export async function requireAdmin(): Promise<AdminUser> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/admin/login")

  const { data: admin } = await supabase
    .from("admin_users")
    .select("*")
    .eq("user_id", user.id)
    .single()

  if (!admin) redirect("/admin/login")

  return admin as AdminUser
}

/** Check if current user is an admin without redirecting. */
export async function getAdmin(): Promise<AdminUser | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: admin } = await supabase
    .from("admin_users")
    .select("*")
    .eq("user_id", user.id)
    .single()

  return (admin as AdminUser) ?? null
}
