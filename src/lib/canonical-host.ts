import type { NextRequest } from "next/server"
import { getPublicSiteUrl } from "@/lib/site-url"

function getRequestHost(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host
  ).toLowerCase()
}

export function getCanonicalRedirectUrl(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return null

  const canonical = new URL(getPublicSiteUrl())
  const requestUrl = new URL(request.url)
  const requestHost = getRequestHost(request)

  if (requestHost === canonical.host) return null

  const shouldRedirect =
    requestHost.endsWith(".vercel.app") ||
    requestHost === `www.${canonical.host}`

  if (!shouldRedirect) return null

  return new URL(`${requestUrl.pathname}${requestUrl.search}`, canonical)
}
