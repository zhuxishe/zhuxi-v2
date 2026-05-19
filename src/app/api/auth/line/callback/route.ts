import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { buildPublicUrl } from "@/lib/site-url"

const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID!
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET!

function profileErrorRedirect(req: NextRequest) {
  return NextResponse.redirect(new URL("/app/profile?line_error=callback_failed", req.url))
}

function isSecureRequest(req: NextRequest) {
  return req.nextUrl.protocol === "https:"
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")
  const urlState = searchParams.get("state")
  const profileUrl = "/app/profile"

  if (error || !code) {
    return profileErrorRedirect(req)
  }

  // CSRF 验证：比对 URL 中的 state 与 cookie 中保存的 state
  const cookieHeader = req.headers.get("cookie") ?? ""
  const storedState = cookieHeader
    .split(";")
    .map(c => c.trim().split("="))
    .find(([k]) => k === "line_oauth_state")?.[1]

  const clearStateCookie = (res: NextResponse) => {
    res.cookies.set("line_oauth_state", "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
      secure: isSecureRequest(req),
    })
    return res
  }

  if (!urlState || !storedState || urlState !== storedState) {
    const res = profileErrorRedirect(req)
    return clearStateCookie(res)
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL("/login", req.url))

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
      return profileErrorRedirect(req)
    }

    const tokens = await tokenRes.json()

    // Get LINE profile
    const profileRes = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (!profileRes.ok) {
      return profileErrorRedirect(req)
    }

    const lineProfile = await profileRes.json()
    const lineUserId = lineProfile.userId as string

    // Check conflict
    const serviceClient = createAdminClient()

    const { data: existing } = await serviceClient
      .from("members")
      .select("id, user_id")
      .eq("line_user_id", lineUserId)
      .maybeSingle()

    if (existing && existing.user_id !== user.id) {
      return NextResponse.redirect(new URL(`${profileUrl}?line_error=${encodeURIComponent("This LINE account is bound to another user")}`, req.url))
    }

    // Bind
    const { error: updateError } = await serviceClient
      .from("members")
      .update({ line_user_id: lineUserId })
      .eq("user_id", user.id)

    if (updateError) {
      const res = profileErrorRedirect(req)
      return clearStateCookie(res)
    }

    const res = NextResponse.redirect(new URL(`${profileUrl}?line_success=${encodeURIComponent("LINE bound successfully")}`, req.url))
    return clearStateCookie(res)
  } catch (err) {
    console.error("[LINE Callback] Error:", err)
    const res = profileErrorRedirect(req)
    return clearStateCookie(res)
  }
}
