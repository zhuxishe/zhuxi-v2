import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSafePlayerNextPath } from "@/lib/auth/player-next-path"
import type { Database } from "@/types/database.types"

function getSupabasePublicKey() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!key) throw new Error("Missing Supabase public key")
  return key
}

export async function updateSession(request: NextRequest) {
  const createResponse = () => {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set("x-next-pathname", request.nextUrl.pathname)

    return NextResponse.next({
      request: { headers: requestHeaders },
    })
  }

  let response = createResponse()
  const authResponseHeaders = new Headers()

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublicKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )

          const previousCookies = response.cookies.getAll()
          response = createResponse()
          previousCookies.forEach((cookie) => response.cookies.set(cookie))

          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )

          Object.entries(headers).forEach(([name, value]) => authResponseHeaders.set(name, value))
          authResponseHeaders.forEach((value, name) => response.headers.set(name, value))
        },
      },
    }
  )

  await supabase.auth.getClaims()

  if (
    request.nextUrl.pathname === "/login"
    && (request.method === "GET" || request.method === "HEAD")
  ) {
    // Match /app's user validation so revoked sessions cannot bounce between routes.
    const { data: { user }, error } = await supabase.auth.getUser()
    if (!error && user) {
      const nextPath = getSafePlayerNextPath(request.nextUrl.searchParams.get("next"))
      const redirectResponse = NextResponse.redirect(new URL(nextPath, request.url), {
        headers: authResponseHeaders,
      })
      response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie))
      redirectResponse.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0")
      redirectResponse.headers.set("Expires", "0")
      redirectResponse.headers.set("Pragma", "no-cache")
      return redirectResponse
    }
  }

  return response
}
