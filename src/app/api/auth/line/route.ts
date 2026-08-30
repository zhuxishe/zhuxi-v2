import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  buildLineBridgeEmail,
  insertLineMemberRecord,
  isLineBridgeAuthUser,
  isValidLineUserId,
} from "@/lib/member-master/line"
import { createHmac } from "crypto"

/**
 * POST /api/auth/line
 * LINE Login -> Supabase Auth bridge
 * Body: { idToken, profile: { userId, displayName, pictureUrl? } }
 */

const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID!
const LINE_USER_SECRET = process.env.LINE_USER_SECRET!

function generateLineCredentials(lineUserId: string) {
  const email = buildLineBridgeEmail(lineUserId)
  const password = createHmac("sha256", LINE_USER_SECRET)
    .update(`line-auth:${lineUserId}`)
    .digest("hex")
  return { email, password }
}

function safeErrorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === "string" && code.length > 0) return code
  }
  return error instanceof Error ? error.name : "UNKNOWN"
}

export async function POST(req: NextRequest) {
  try {
    const { idToken, profile } = await req.json()
    if (
      typeof idToken !== "string"
      || !isValidLineUserId(profile?.userId)
      || typeof profile?.displayName !== "string"
      || !profile.displayName
    ) {
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
    const supabase = createAdminClient()

    const { data: existingMember } = await supabase
      .from("members")
      .select("id, user_id, status")
      .eq("line_user_id", profile.userId)
      .maybeSingle()

    const { email, password } = generateLineCredentials(profile.userId)

    if (existingMember) {
      // A normal email/Google Auth user may attach LINE as a secondary
      // identity. That does not give this bridge permission to manufacture a
      // session for that Auth user. Only deterministic LINE-native Auth users
      // can sign in here; everyone else must use their original sign-in method.
      if (!existingMember.user_id) {
        return NextResponse.json(
          { error: "LINE account is linked to another sign-in method", code: "line_linked_external_auth" },
          { status: 409 }
        )
      }

      const { data: authLookup, error: authLookupError } =
        await supabase.auth.admin.getUserById(existingMember.user_id)
      if (authLookupError || !authLookup.user) {
        return NextResponse.json({ error: "Login failed" }, { status: 500 })
      }
      if (!isLineBridgeAuthUser(authLookup.user, profile.userId)) {
        return NextResponse.json(
          { error: "LINE account is linked to another sign-in method", code: "line_linked_external_auth" },
          { status: 409 }
        )
      }

      // 3a. Existing LINE-native member -> sign in
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError || !signInData.session) {
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
      app_metadata: { auth_origin: "line_bridge", line_user_id: profile.userId },
    })

    if (createError || !newUser.user) {
      return NextResponse.json({ error: "Failed to create account" }, { status: 500 })
    }

    // Create the canonical member master row. Service role stays server-only;
    // the browser receives only the intended Supabase session tokens below.
    const { error: memberError } = await insertLineMemberRecord(supabase, {
      userId: newUser.user.id,
      email,
      lineUserId: profile.userId,
      linkedAt: new Date().toISOString(),
    })

    if (memberError) {
      try {
        const { error: rollbackError } = await supabase.auth.admin.deleteUser(newUser.user.id)
        if (rollbackError) {
          console.error("[LINE Auth] canonical member rollback failed:", rollbackError.code ?? "UNKNOWN")
        }
      } catch {
        // Best effort only. Do not log the LINE profile, Auth user id, email,
        // tokens, or the original database payload.
        console.error("[LINE Auth] canonical member rollback failed: UNKNOWN")
      }
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
    console.error("[LINE Auth] unexpected failure:", safeErrorCode(err))
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
