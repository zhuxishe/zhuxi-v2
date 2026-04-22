const SUPABASE_ORIGIN = "https://wjjhprflldvclulistcx.supabase.co"
const STORAGE_PROXY_ORIGIN = process.env.NEXT_PUBLIC_STORAGE_PROXY_ORIGIN

export function rewriteStorageUrl<T extends string | null | undefined>(url: T): T {
  if (!url) return url
  if (!STORAGE_PROXY_ORIGIN) return url
  if (!url.startsWith(SUPABASE_ORIGIN)) return url
  return `${STORAGE_PROXY_ORIGIN}${url.slice(SUPABASE_ORIGIN.length)}` as T
}
