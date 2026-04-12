import { NextRequest, NextResponse } from "next/server"
import { resolvePlayerRoute } from "@/lib/auth/routing"
import { getSingleRelation } from "@/lib/supabase/relations"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /login/callback
 * Handles OAuth callback (Google) and email confirmation.
 * - Exchanges auth code for session
 * - Verifies the session is actually usable
 * - Uses the same route resolver as /app to avoid first-login drift
 */

function buildRedirectUrl(req: NextRequest, path: string) {
  const currentUrl = new URL(req.url)
  const forwardedHost = req.headers.get("x-forwarded-host")
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https"

  if (process.env.NODE_ENV !== "development" && forwardedHost) {
    return new URL(path, `${forwardedProto}://${forwardedHost}`)
  }

  return new URL(path, currentUrl.origin)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")

  if (!code) {
    return NextResponse.redirect(buildRedirectUrl(req, "/login?error=oauth_failed"))
  }

  const supabase = await createClient()

  // Exchange the OAuth code for a session
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error("[login/callback] exchangeCodeForSession failed:", error.message)
    return NextResponse.redirect(buildRedirectUrl(req, "/login?error=oauth_failed"))
  }

  // Verify the session is usable
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    console.error("[login/callback] getUser failed after exchange:", userError?.message)
    return NextResponse.redirect(buildRedirectUrl(req, "/login?error=oauth_failed"))
  }

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id, status, member_identity(full_name)")
    .eq("user_id", user.id)
    .maybeSingle()

  if (memberError) {
    console.error("[login/callback] member lookup failed:", memberError.message)
    return NextResponse.redirect(buildRedirectUrl(req, "/app"))
  }

  const identity = member
    ? getSingleRelation(
        member.member_identity as { full_name: string | null } | { full_name: string | null }[] | null
      )
    : null

  const route = resolvePlayerRoute(
    member ? { status: member.status, hasIdentity: !!identity } : null
  )

  if (route.action === "redirect") {
    return NextResponse.redirect(buildRedirectUrl(req, route.to))
  }

  return NextResponse.redirect(buildRedirectUrl(req, "/app"))
}
