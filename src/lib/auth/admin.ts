import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import type { AdminUser } from "@/types"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getAdminDb() {
  return createServiceClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Check if current user is an admin. Redirects to /admin/login if not.
 * Also handles whitelist auto-bind: if user's email matches a whitelist
 * entry (user_id IS NULL), automatically binds user_id.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) redirect("/admin/login")

  const adminDb = getAdminDb()

  // 1. Check if already activated
  const { data: admin } = await adminDb
    .from("admin_users")
    .select("*")
    .eq("user_id", user.id)
    .single()

  if (admin) return admin as AdminUser

  // 2. Check whitelist by email (user_id IS NULL = invited, not yet bound)
  const { data: whitelisted } = await adminDb
    .from("admin_users")
    .select("*")
    .eq("email", user.email.toLowerCase())
    .is("user_id", null)
    .single()

  if (whitelisted) {
    // Auto-bind user_id
    const { data: bound } = await adminDb
      .from("admin_users")
      .update({ user_id: user.id, name: user.user_metadata?.full_name ?? user.email.split("@")[0] })
      .eq("id", whitelisted.id)
      .select("*")
      .single()

    if (bound) return bound as AdminUser
  }

  // 3. Not admin — sign out and redirect
  redirect("/admin/login?error=not_admin")
}

/** Check if current user is an admin without redirecting. */
export async function getAdmin(): Promise<AdminUser | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) return null

  const adminDb = getAdminDb()

  // Check activated
  const { data: admin } = await adminDb
    .from("admin_users")
    .select("*")
    .eq("user_id", user.id)
    .single()

  if (admin) return admin as AdminUser

  // Check whitelist (auto-bind)
  const { data: whitelisted } = await adminDb
    .from("admin_users")
    .select("*")
    .eq("email", user.email.toLowerCase())
    .is("user_id", null)
    .single()

  if (whitelisted) {
    const { data: bound } = await adminDb
      .from("admin_users")
      .update({ user_id: user.id, name: user.user_metadata?.full_name ?? user.email.split("@")[0] })
      .eq("id", whitelisted.id)
      .select("*")
      .single()

    if (bound) return bound as AdminUser
  }

  return null
}
