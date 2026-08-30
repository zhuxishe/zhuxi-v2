import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  ensureMyMemberRecord,
  getMemberMasterDiagnostic,
} from "@/lib/member-master/rpc"

/**
 * GET /admin/login/callback
 * Exchange the OAuth code, establish the canonical member master row from the
 * authenticated user id, then let requireAdmin() perform its separate admin
 * whitelist check. Member ownership is never inferred from email here.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")

  if (!code) {
    return NextResponse.redirect(new URL("/admin/login?error=no_code", req.url))
  }

  const supabase = await createClient()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    return NextResponse.redirect(new URL("/admin/login?error=auth_failed", req.url))
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL("/admin/login?error=auth_failed", req.url))
  }

  try {
    await ensureMyMemberRecord(supabase)
  } catch (error) {
    console.error(
      "[admin login callback] member master failed:",
      getMemberMasterDiagnostic(error)
    )
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL("/admin/login?error=auth_failed", req.url))
  }

  return NextResponse.redirect(new URL("/admin", req.url))
}
