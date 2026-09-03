const CONTENT_MEDIA_BUCKETS = new Set(["scripts-covers", "activity-media"])
const PRIVATE_CONTENT_BUCKETS = new Set(["scripts"])

const CONTENT_MEDIA_HOSTS = new Set([
  "wjjhprflldvclulistcx.supabase.co",
  "api.zhuxishe.com",
  ...environmentSupabaseHosts(),
])

function environmentSupabaseHosts() {
  try {
    const configured = process.env.NEXT_PUBLIC_SUPABASE_URL
    return configured ? [new URL(configured).hostname.toLowerCase()] : []
  } catch {
    return []
  }
}

/**
 * Returns null for a genuinely external HTTPS URL. URLs that point at one of
 * our managed public-media buckets must use the canonical, unescaped public
 * object form so database reference checks can compare them without ambiguity.
 */
export function managedContentImageUrlIsCanonical(value: string): boolean | null {
  if (/[\u0000-\u001f\\]/.test(value)) return false
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false
  if (!CONTENT_MEDIA_HOSTS.has(parsed.hostname.toLowerCase())) return null

  const match = parsed.pathname.match(
    /^\/storage\/v1\/(object\/public|render\/image\/public|object\/sign|object\/authenticated)\/([^/]+)\/(.+)$/,
  )
  if (!match) return null
  if (PRIVATE_CONTENT_BUCKETS.has(match[2])) return false
  if (!CONTENT_MEDIA_BUCKETS.has(match[2])) return null
  if (match[1] !== "object/public") return false

  // WHATWG URL parsing normalizes backslashes and dot path segments. Compare
  // the raw path before accepting a managed reference so cleanup lookups see
  // exactly the same bytes that the browser ultimately requests.
  const rawPath = value.match(/^https:\/\/[^/?#]+([^?#]*)/i)?.[1]
  if (!rawPath || rawPath !== parsed.pathname) return false

  const objectPath = match[3]
  return !objectPath.includes("%")
    && !objectPath.includes("..")
    && !objectPath.includes("\\")
    && !objectPath.startsWith("/")
    && /^[A-Za-z0-9._~/-]+$/.test(objectPath)
}
