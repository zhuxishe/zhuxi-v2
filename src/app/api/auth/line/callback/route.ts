import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID!
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET!

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")
  const profileUrl = "/app/profile"

  if (error || !code) {
    const msg = error ? "LINE authorization cancelled" : "Missing auth code"
    return NextResponse.redirect(new URL(`${profileUrl}?line_error=${encodeURIComponent(msg)}`, req.url))
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
        redirect_uri: `${getBaseUrl(req)}/api/auth/line/callback`,
        client_id: LINE_CHANNEL_ID,
        client_secret: LINE_CHANNEL_SECRET,
      }),
    })

    if (!tokenRes.ok) {
      return NextResponse.redirect(new URL(`${profileUrl}?line_error=${encodeURIComponent("Token exchange failed")}`, req.url))
    }

    const tokens = await tokenRes.json()

    // Get LINE profile
    const profileRes = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (!profileRes.ok) {
      return NextResponse.redirect(new URL(`${profileUrl}?line_error=${encodeURIComponent("Failed to get LINE profile")}`, req.url))
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
      return NextResponse.redirect(new URL(`${profileUrl}?line_error=${encodeURIComponent(updateError.message)}`, req.url))
    }

    return NextResponse.redirect(new URL(`${profileUrl}?line_success=${encodeURIComponent("LINE bound successfully")}`, req.url))
  } catch (err) {
    console.error("[LINE Callback] Error:", err)
    return NextResponse.redirect(new URL(`${profileUrl}?line_error=${encodeURIComponent("Server error")}`, req.url))
  }
}

function getBaseUrl(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https"
  const host = req.headers.get("host") || "zhuxi-v2.vercel.app"
  return `${proto}://${host}`
}
