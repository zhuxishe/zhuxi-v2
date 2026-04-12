import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /login/callback
 * Handles OAuth callback (Google) and email confirmation.
 * - Exchanges auth code for session
 * - Verifies the session is actually usable
 * - Routes new users directly to interview-form (skips /app redirect)
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get("code")

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", origin))
  }

  const supabase = await createClient()

  // Exchange the OAuth code for a session
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error("[login/callback] exchangeCodeForSession failed:", error.message)
    return NextResponse.redirect(new URL("/login?error=oauth_failed", origin))
  }

  // Verify the session is usable
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    console.error("[login/callback] getUser failed after exchange:", userError?.message)
    return NextResponse.redirect(new URL("/login?error=oauth_failed", origin))
  }

  // Check if this user already has a member record
  const { data: member } = await supabase
    .from("members")
    .select("id, status")
    .eq("user_id", user.id)
    .single()

  // New user → go directly to interview form (skip /app redirect)
  if (!member) {
    return NextResponse.redirect(new URL("/app/interview-form", origin))
  }

  // Existing user → go to app home
  return NextResponse.redirect(new URL("/app", origin))
}
