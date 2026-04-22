import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { resolvePlayerRoute } from "@/lib/auth/routing"
import { getSingleRelation } from "@/lib/supabase/relations"
import { buildPublicUrl } from "@/lib/site-url"
import type { Database } from "@/types/database.types"

/**
 * GET /login/callback
 * Handles OAuth callback (Google) and email confirmation.
 * - Exchanges auth code for session
 * - Verifies the session is actually usable
 * - Uses the same route resolver as /app to avoid first-login drift
 */

function buildRedirectUrl(req: NextRequest, path: string) {
  if (process.env.NODE_ENV !== "development") {
    return new URL(buildPublicUrl(path))
  }

  return new URL(path, new URL(req.url).origin)
}

function getSafeNextPath(req: NextRequest) {
  const next = new URL(req.url).searchParams.get("next")
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/app"
  return next.startsWith("/app") ? next : "/app"
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach(({ name, value, ...rest }) => {
    to.cookies.set(name, value, rest)
  })
  return to
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const nextPath = getSafeNextPath(req)
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!code) {
    return NextResponse.redirect(buildRedirectUrl(req, "/login?error=oauth_failed"))
  }

  if (!supabaseKey) {
    console.error("[login/callback] missing Supabase public key")
    return NextResponse.redirect(buildRedirectUrl(req, "/login?error=oauth_failed"))
  }

  let authResponse = NextResponse.next({ request: req })
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))

          authResponse = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) =>
            authResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

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
    return copyCookies(
      authResponse,
      NextResponse.redirect(buildRedirectUrl(req, route.to))
    )
  }

  return copyCookies(
    authResponse,
    NextResponse.redirect(buildRedirectUrl(req, nextPath))
  )
}
