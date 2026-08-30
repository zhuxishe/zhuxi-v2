import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { buildPublicUrl } from "@/lib/site-url"
import {
  getLineIdentityDiagnostic,
  isValidLineUserId,
  serviceSetMemberLineIdentity,
  toPublicLineIdentityError,
} from "@/lib/member-master/line"

const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID!
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET!

function profileErrorRedirect(req: NextRequest) {
  return NextResponse.redirect(new URL("/app/profile?line_error=callback_failed", req.url))
}

function isSecureRequest(req: NextRequest) {
  return req.nextUrl.protocol === "https:"
}

function safeErrorName(error: unknown) {
  return error instanceof Error && error.name ? error.name : "UNKNOWN"
}

function clearStateCookie(req: NextRequest, res: NextResponse) {
  res.cookies.set("line_oauth_state", "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    secure: isSecureRequest(req),
  })
  return res
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")
  const urlState = searchParams.get("state")
  const profileUrl = "/app/profile"

  if (error || !code) {
    return clearStateCookie(req, profileErrorRedirect(req))
  }

  // CSRF 验证：比对 URL 中的 state 与 cookie 中保存的 state
  const cookieHeader = req.headers.get("cookie") ?? ""
  const storedState = cookieHeader
    .split(";")
    .map(c => c.trim().split("="))
    .find(([k]) => k === "line_oauth_state")?.[1]

  if (!urlState || !storedState || urlState !== storedState) {
    const res = profileErrorRedirect(req)
    return clearStateCookie(req, res)
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return clearStateCookie(req, NextResponse.redirect(new URL("/login", req.url)))
    }

    // Exchange code for tokens
    const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: buildPublicUrl("/api/auth/line/callback"),
        client_id: LINE_CHANNEL_ID,
        client_secret: LINE_CHANNEL_SECRET,
      }),
    })

    if (!tokenRes.ok) {
      return clearStateCookie(req, profileErrorRedirect(req))
    }

    const tokens = await tokenRes.json() as { access_token?: unknown }
    if (typeof tokens.access_token !== "string" || !tokens.access_token) {
      return clearStateCookie(req, profileErrorRedirect(req))
    }

    // Get LINE profile
    const profileRes = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (!profileRes.ok) {
      return clearStateCookie(req, profileErrorRedirect(req))
    }

    const lineProfile = await profileRes.json() as { userId?: unknown }
    if (!isValidLineUserId(lineProfile.userId)) {
      return clearStateCookie(req, profileErrorRedirect(req))
    }
    const lineUserId = lineProfile.userId

    // The service-only RPC owns conflict detection, atomic mutation, fixed
    // reason/source values and append-only audit creation.
    const serviceClient = createAdminClient()
    const { error: updateError } = await serviceSetMemberLineIdentity(serviceClient, {
      userId: user.id,
      lineUserId,
      operation: "bind",
    })

    if (updateError) {
      console.error(
        "[LINE Callback] identity RPC failed:",
        getLineIdentityDiagnostic(updateError)
      )
      const publicError = toPublicLineIdentityError(updateError)
      const res = NextResponse.redirect(new URL(
        `${profileUrl}?line_error=${encodeURIComponent(publicError.message)}`,
        req.url
      ))
      return clearStateCookie(req, res)
    }

    const res = NextResponse.redirect(new URL(`${profileUrl}?line_success=${encodeURIComponent("LINE bound successfully")}`, req.url))
    return clearStateCookie(req, res)
  } catch (err) {
    console.error("[LINE Callback] unexpected failure:", safeErrorName(err))
    const res = profileErrorRedirect(req)
    return clearStateCookie(req, res)
  }
}
