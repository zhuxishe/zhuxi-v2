const SUPABASE_ORIGIN = 'https://wjjhprflldvclulistcx.supabase.co'
const API_ORIGIN = 'https://api.zhuxishe.com'

export function rewriteStorageUrl<T extends string | null | undefined>(url: T): T {
  if (!url) return url
  if (!url.startsWith(SUPABASE_ORIGIN)) return url
  return `${API_ORIGIN}${url.slice(SUPABASE_ORIGIN.length)}` as T
}
