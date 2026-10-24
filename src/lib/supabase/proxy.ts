import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSafePlayerNextPath, PLAYER_HAD_SESSION_HEADER, PLAYER_RETURN_PATH_HEADER } from "@/lib/auth/player-next-path"
import type { Database } from "@/types/database.types"
import { createObservedSupabaseFetch } from "./observed-fetch"

function getSupabasePublicKey() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!key) throw new Error("Missing Supabase public key")
  return key
}

export async function updateSession(request: NextRequest) {
  // Capture before the SDK clears an invalid token. This affects the login notice only.
  const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0]
  const authCookieName = `sb-${projectRef}-auth-token`
  const hadSessionCookie = request.cookies.getAll().some(({ name, value }) =>
    Boolean(value) && (name === authCookieName || new RegExp(`^${authCookieName}\\.\\d+$`).test(name))
  )
  const returnUrl = request.nextUrl.clone()
  returnUrl.searchParams.delete("_rsc")
  const createResponse = () => {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set("x-next-pathname", request.nextUrl.pathname)
    requestHeaders.set(PLAYER_RETURN_PATH_HEADER, getSafePlayerNextPath(`${returnUrl.pathname}${returnUrl.search}`))
    requestHeaders.set(PLAYER_HAD_SESSION_HEADER, hadSessionCookie ? "1" : "0")

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
      global: { fetch: createObservedSupabaseFetch("proxy") },
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
