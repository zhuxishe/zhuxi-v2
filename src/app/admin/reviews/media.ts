import { managedContentImageUrlIsCanonical } from "@/lib/content-media-url"

export const ACTIVITY_MEDIA_BUCKET = "activity-media"

const ACTIVITY_MEDIA_HOSTS = new Set([
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

export function managedActivityMediaPath(url: string): string | null {
  try {
    if (managedContentImageUrlIsCanonical(url) !== true) return null
    const parsed = new URL(url)
    if (!ACTIVITY_MEDIA_HOSTS.has(parsed.hostname.toLowerCase())) return null
    const marker = `/storage/v1/object/public/${ACTIVITY_MEDIA_BUCKET}/`
    if (!parsed.pathname.startsWith(marker)) return null

    const path = parsed.pathname.slice(marker.length)
    if (!path || path.includes("..") || path.startsWith("/")) return null
    return path
  } catch {
    return null
  }
}
