import { NextResponse, type NextRequest } from "next/server"
import { getCanonicalRedirectUrl } from "@/lib/canonical-host"
import { updateSession } from "@/lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  const canonicalUrl = getCanonicalRedirectUrl(request)
  if (canonicalUrl) {
    return NextResponse.redirect(canonicalUrl, 308)
  }

  return updateSession(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
