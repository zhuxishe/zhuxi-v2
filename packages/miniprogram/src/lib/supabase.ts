import Taro from '@tarojs/taro'

const SUPABASE_URL = 'https://wjjhprflldvclulistcx.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqamhwcmZsbGR2Y2x1bGlzdGN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzOTM3MzEsImV4cCI6MjA5MDk2OTczMX0.RwGsdyStOl0kh3H-wez0ls84RSkWhPaGXb4YVacug9M'

/** 存储 session tokens */
export function saveSession(session: { access_token: string; refresh_token: string }) {
  Taro.setStorageSync('supabase_access_token', session.access_token)
  Taro.setStorageSync('supabase_refresh_token', session.refresh_token)
}

/** 获取存储的 access token */
export function getAccessToken(): string | null {
  return Taro.getStorageSync('supabase_access_token') || null
}

/** 清除 session */
export function clearSession() {
  Taro.removeStorageSync('supabase_access_token')
  Taro.removeStorageSync('supabase_refresh_token')
}

/** 判断是否已登录 */
export function isLoggedIn(): boolean {
  return !!getAccessToken()
}

/** 调用 Supabase Edge Function */
export async function callEdgeFunction<T = unknown>(
  fnName: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await Taro.request({
    url: `${SUPABASE_URL}/functions/v1/${fnName}`,
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    data: body,
  })

  if (res.statusCode >= 400) {
    throw new Error(res.data?.error || `Edge function error: ${res.statusCode}`)
  }
  return res.data as T
}

/** 带认证的 Supabase REST API 调用 */
export async function supabaseQuery<T = unknown>(
  table: string,
  query: string = '',
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = getAccessToken()
  if (!token) throw new Error('Not authenticated')

  const res = await Taro.request({
    url: `${SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`,
    method: (options.method as keyof Taro.request.Method) || 'GET',
    header: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    data: options.body,
  })

  if (res.statusCode >= 400) {
    throw new Error(res.data?.message || `Query error: ${res.statusCode}`)
  }
  return res.data as T
}

export { SUPABASE_URL, SUPABASE_ANON_KEY }
