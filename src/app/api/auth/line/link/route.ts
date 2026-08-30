import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  getLineIdentityDiagnostic,
  isValidLineUserId,
  serviceSetMemberLineIdentity,
  toPublicLineIdentityError,
} from "@/lib/member-master/line"

const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID!

/** POST: Bind LINE account to current user */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 })

    const body = await readJsonBody(req)
    if (!body || typeof body.idToken !== "string" || !isValidLineUserId(body.lineUserId)) {
      return NextResponse.json({ error: "Missing or invalid params" }, { status: 400 })
    }

    // Verify LINE token and require its subject to match the claimed identity.
    const verifyRes = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: body.idToken, client_id: LINE_CHANNEL_ID }),
    })
    if (!verifyRes.ok) {
      return NextResponse.json({ error: "LINE verification failed" }, { status: 401 })
    }

    const verifyData = await verifyRes.json() as { sub?: unknown }
    if (verifyData.sub !== body.lineUserId) {
      return NextResponse.json({ error: "Token subject mismatch" }, { status: 403 })
    }

    const serviceClient = createAdminClient()
    const { error } = await serviceSetMemberLineIdentity(serviceClient, {
      userId: user.id,
      lineUserId: body.lineUserId,
      operation: "bind",
    })
    if (error) return lineIdentityErrorResponse(error)
    return NextResponse.json({ success: true })
  } catch {
    return unexpectedLineIdentityError()
  }
}

/** DELETE: Unbind LINE account */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 })

    // The value came from the authenticated user's canonical profile. The RPC
    // compares it with the locked row before clearing, so a stale or tampered
    // request cannot unlink a different identity.
    const body = await readJsonBody(req)
    if (!body || !isValidLineUserId(body.lineUserId)) {
      return NextResponse.json({ error: "Missing or invalid params" }, { status: 400 })
    }

    const serviceClient = createAdminClient()
    const { error } = await serviceSetMemberLineIdentity(serviceClient, {
      userId: user.id,
      lineUserId: body.lineUserId,
      operation: "unbind",
    })
    if (error) return lineIdentityErrorResponse(error)
    return NextResponse.json({ success: true })
  } catch {
    return unexpectedLineIdentityError()
  }
}

async function readJsonBody(req: NextRequest) {
  try {
    const value: unknown = await req.json()
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function lineIdentityErrorResponse(error: { code?: string; message?: string }) {
  console.error(
    "[LINE Link] identity RPC failed:",
    getLineIdentityDiagnostic(error)
  )
  const publicError = toPublicLineIdentityError(error)
  return NextResponse.json(
    { error: publicError.message, code: publicError.code },
    { status: publicError.status }
  )
}

function unexpectedLineIdentityError() {
  return NextResponse.json(
    { error: "LINE account update failed", code: "line_identity_update_failed" },
    { status: 500 }
  )
}
