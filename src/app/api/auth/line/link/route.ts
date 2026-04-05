import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID!

/** POST: Bind LINE account to current user */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 })

  const { idToken, lineUserId } = await req.json()
  if (!idToken || !lineUserId) return NextResponse.json({ error: "Missing params" }, { status: 400 })

  // Verify LINE token
  const verifyRes = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: LINE_CHANNEL_ID }),
  })
  if (!verifyRes.ok) return NextResponse.json({ error: "LINE verification failed" }, { status: 401 })

  const serviceClient = createAdminClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Check conflict
  const { data: existing } = await serviceClient
    .from("members")
    .select("id, user_id")
    .eq("line_user_id", lineUserId)
    .maybeSingle()

  if (existing && existing.user_id !== user.id) {
    return NextResponse.json({ error: "LINE account bound to another user" }, { status: 409 })
  }

  const { error } = await serviceClient
    .from("members")
    .update({ line_user_id: lineUserId })
    .eq("user_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

/** DELETE: Unbind LINE account */
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 })

  const serviceClient = createAdminClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await serviceClient
    .from("members")
    .update({ line_user_id: null })
    .eq("user_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
