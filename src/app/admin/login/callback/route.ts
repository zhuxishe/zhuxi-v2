import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * GET /admin/login/callback
 * 1. Exchange code → set session cookie
 * 2. Check admin_users (service role, bypass RLS)
 * 3. Whitelist auto-bind if needed
 * 4. Non-admin → sign out
 *
 * Key: redirect uses forwardedHost for Vercel compatibility
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get("code")
  const forwardedHost = req.headers.get("x-forwarded-host")
  const baseUrl = forwardedHost ? `https://${forwardedHost}` : origin

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/admin/login?error=no_code`)
  }

  const supabase = await createClient()
  const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code)
  if (sessionError) {
    return NextResponse.redirect(`${baseUrl}/admin/login?error=auth_failed`)
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.redirect(`${baseUrl}/admin/login?error=auth_failed`)
  }

  // Service role for admin_users queries (bypasses RLS)
  const adminDb = createAdminClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Already activated?
  const { data: activated } = await adminDb
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (activated) {
    return NextResponse.redirect(`${baseUrl}/admin`)
  }

  // 2. Whitelist match? (user_id IS NULL = invited, not yet logged in)
  const { data: whitelisted } = await adminDb
    .from("admin_users")
    .select("id")
    .eq("email", user.email.toLowerCase())
    .is("user_id", null)
    .single()

  if (whitelisted) {
    await adminDb
      .from("admin_users")
      .update({ user_id: user.id, name: user.user_metadata?.full_name ?? user.email.split("@")[0] })
      .eq("id", whitelisted.id)
    return NextResponse.redirect(`${baseUrl}/admin`)
  }

  // 3. Not authorized
  await supabase.auth.signOut()
  return NextResponse.redirect(`${baseUrl}/admin/login?error=not_admin`)
}
