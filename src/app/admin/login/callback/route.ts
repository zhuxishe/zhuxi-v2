import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /admin/login/callback
 * Minimal: exchange code for session, then redirect to /admin.
 * Admin verification + whitelist binding handled by requireAdmin().
 * Identical pattern to /login/callback (which works on Vercel).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(new URL("/admin", req.url))
}
