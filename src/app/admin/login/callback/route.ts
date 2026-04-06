import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * GET /admin/login/callback
 * Admin-only Google OAuth callback.
 * Uses service role client for admin_users checks (bypasses RLS,
 * because RLS auth.uid() may not be ready right after code exchange).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")

  if (!code) {
    return NextResponse.redirect(new URL("/admin/login?error=no_code", req.url))
  }

  // Cookie-based client for session management
  const supabase = await createClient()

  const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code)
  if (sessionError) {
    return NextResponse.redirect(new URL("/admin/login?error=auth_failed", req.url))
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.redirect(new URL("/admin/login?error=auth_failed", req.url))
  }

  // Service role client for admin_users queries (bypasses RLS)
  const adminDb = createAdminClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Check if already activated (user_id bound)
  const { data: activated } = await adminDb
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (activated) {
    return NextResponse.redirect(new URL("/admin", req.url))
  }

  // 2. Check whitelist by email (user_id is NULL = invited but not yet logged in)
  const { data: whitelisted } = await adminDb
    .from("admin_users")
    .select("id")
    .eq("email", user.email.toLowerCase())
    .is("user_id", null)
    .single()

  if (whitelisted) {
    const { error: bindError } = await adminDb
      .from("admin_users")
      .update({ user_id: user.id, name: user.user_metadata?.full_name ?? user.email.split("@")[0] })
      .eq("id", whitelisted.id)

    if (bindError) {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL("/admin/login?error=auth_failed", req.url))
    }

    return NextResponse.redirect(new URL("/admin", req.url))
  }

  // 3. Not authorized
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL("/admin/login?error=not_admin", req.url))
}
