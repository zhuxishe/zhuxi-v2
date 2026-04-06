import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /admin/login/callback
 * Admin-only Google OAuth callback.
 * 1. Exchanges code for session
 * 2. Checks admin_users by user_id (already activated)
 * 3. If not found, checks by email (whitelist, user_id is NULL)
 * 4. If whitelist match → auto-bind user_id → enter admin
 * 5. Otherwise → sign out, reject
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")

  if (!code) {
    return NextResponse.redirect(new URL("/admin/login?error=no_code", req.url))
  }

  const supabase = await createClient()

  const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code)
  if (sessionError) {
    return NextResponse.redirect(new URL("/admin/login?error=auth_failed", req.url))
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.redirect(new URL("/admin/login?error=auth_failed", req.url))
  }

  // 1. Check if already activated (user_id bound)
  const { data: activated } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (activated) {
    return NextResponse.redirect(new URL("/admin", req.url))
  }

  // 2. Check whitelist by email (user_id is NULL = invited but not yet logged in)
  const { data: whitelisted } = await supabase
    .from("admin_users")
    .select("id")
    .eq("email", user.email.toLowerCase())
    .is("user_id", null)
    .single()

  if (whitelisted) {
    // Auto-bind: link the auth user to this whitelist entry
    const { error: bindError } = await supabase
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
