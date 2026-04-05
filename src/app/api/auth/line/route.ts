import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { createHmac } from "crypto"

/**
 * POST /api/auth/line
 * LINE Login -> Supabase Auth bridge
 * Body: { idToken, profile: { userId, displayName, pictureUrl? } }
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID!
const LINE_USER_SECRET = process.env.LINE_USER_SECRET!

function generateLineCredentials(lineUserId: string) {
  const email = `line_${lineUserId}@line.zhuxi.app`
  const password = createHmac("sha256", LINE_USER_SECRET)
    .update(`line-auth:${lineUserId}`)
    .digest("hex")
  return { email, password }
}

export async function POST(req: NextRequest) {
  try {
    const { idToken, profile } = await req.json()
    if (!idToken || !profile?.userId || !profile?.displayName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // 1. Verify LINE ID Token
    const verifyRes = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: LINE_CHANNEL_ID }),
    })

    if (!verifyRes.ok) {
      return NextResponse.json({ error: "LINE token verification failed" }, { status: 401 })
    }

    const lineVerified = await verifyRes.json()
    if (lineVerified.sub !== profile.userId) {
      return NextResponse.json({ error: "Token subject mismatch" }, { status: 401 })
    }

    // 2. Check existing member
    const supabase = createAdminClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: existingMember } = await supabase
      .from("members")
      .select("id, user_id, status")
      .eq("line_user_id", profile.userId)
      .maybeSingle()

    const { email, password } = generateLineCredentials(profile.userId)

    if (existingMember) {
      // 3a. Existing member -> sign in
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        return NextResponse.json({ error: "Login failed" }, { status: 401 })
      }
      return NextResponse.json({
        session: { access_token: signInData.session.access_token, refresh_token: signInData.session.refresh_token },
        isNewUser: false,
      })
    }

    // 3b. New user -> create auth + member
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { line_user_id: profile.userId, display_name: profile.displayName, avatar_url: profile.pictureUrl },
    })

    if (createError || !newUser.user) {
      return NextResponse.json({ error: "Failed to create account" }, { status: 500 })
    }

    // Create members record
    const { error: memberError } = await supabase.from("members").insert({
      user_id: newUser.user.id,
      email,
      line_user_id: profile.userId,
      status: "pending",
    })

    if (memberError) {
      await supabase.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json({ error: "Failed to create member" }, { status: 500 })
    }

    // Sign in
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError || !signInData.session) {
      return NextResponse.json({ error: "Account created but login failed" }, { status: 500 })
    }

    return NextResponse.json({
      session: { access_token: signInData.session.access_token, refresh_token: signInData.session.refresh_token },
      isNewUser: true,
    })
  } catch (err) {
    console.error("[LINE Auth] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
