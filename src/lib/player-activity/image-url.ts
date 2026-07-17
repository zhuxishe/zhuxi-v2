const STORAGE_PATH_PREFIX = "/storage/v1/object/public/"
const STORAGE_HOSTS = new Set([
  "api.zhuxishe.com",
  "wjjhprflldvclulistcx.supabase.co",
])
const UNSAFE_URL_CHARS = /[\u0000-\u001f"'<>\\]/

export function isSupportedPlayerImageUrl(value: string): boolean {
  const input = value.trim()
  if (!input || UNSAFE_URL_CHARS.test(input)) return false
  if (input.startsWith("/")) return !input.startsWith("//")

  try {
    const url = new URL(input)
    if (url.protocol !== "https:") return false
    if (url.hostname === "images.unsplash.com") return true
    return STORAGE_HOSTS.has(url.hostname) && url.pathname.startsWith(STORAGE_PATH_PREFIX)
  } catch {
    return false
  }
}
