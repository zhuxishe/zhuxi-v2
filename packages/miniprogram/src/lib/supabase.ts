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

/** 获取 refresh token */
export function getRefreshToken(): string | null {
  return Taro.getStorageSync('supabase_refresh_token') || null
}

/** 清除 session */
export function clearSession() {
  Taro.removeStorageSync('supabase_access_token')
  Taro.removeStorageSync('supabase_refresh_token')
}

/** 刷新 session，返回新 access_token；失败则清除登录态 */
let _refreshPromise: Promise<string | null> | null = null

export async function refreshSession(): Promise<string | null> {
  // 并发锁：多个 401 同时触发只刷新一次
  if (_refreshPromise) return _refreshPromise

  _refreshPromise = (async () => {
    const rt = getRefreshToken()
    if (!rt) {
      clearSession()
      return null
    }
    try {
      const res = await Taro.request({
        url: `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
        },
        data: { refresh_token: rt },
      })
      if (res.statusCode >= 400 || !res.data?.access_token) {
        clearSession()
        return null
      }
      saveSession({ access_token: res.data.access_token, refresh_token: res.data.refresh_token })
      return res.data.access_token as string
    } catch {
      clearSession()
      return null
    } finally {
      _refreshPromise = null
    }
  })()

  return _refreshPromise
}

/** 判断是否已登录 */
export function isLoggedIn(): boolean {
  return !!getAccessToken()
}

/** 从 JWT 中解析 user_id（小程序兼容的 base64 解码） */
export function getUserIdFromToken(): string | null {
  const token = getAccessToken()
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    // 小程序环境没有 atob，手动解码 base64url
    const payload = base64UrlDecode(parts[1])
    const data = JSON.parse(payload)
    return data.sub || null
  } catch {
    return null
  }
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

/**
 * Supabase PostgREST 查询
 * @param table 表名
 * @param params 查询参数对象，如 { select: '...', 'user_id': 'eq.xxx' }
 */
export async function supabaseQuery<T = unknown>(
  table: string,
  params: Record<string, string> = {},
  options: { method?: string; body?: unknown; single?: boolean } = {}
): Promise<T> {
  const token = getAccessToken()
  if (!token) throw new Error('Not authenticated')

  const queryStr = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'apikey': SUPABASE_ANON_KEY,
  }

  // single() 模式：让 PostgREST 返回对象而非数组
  if (options.single) {
    header['Accept'] = 'application/vnd.pgrst.object+json'
  }

  // upsert 模式：POST + on_conflict 参数时自动加 Prefer header
  if (options.method === 'POST' && params.on_conflict) {
    header['Prefer'] = 'resolution=merge-duplicates'
  }

  const url = `${SUPABASE_URL}/rest/v1/${table}${queryStr ? '?' + queryStr : ''}`
  const method = (options.method || 'GET') as keyof Taro.request.Method

  const res = await Taro.request({ url, method, header, data: options.body })

  // 401 → 尝试刷新 token 并重试一次
  if (res.statusCode === 401) {
    const newToken = await refreshSession()
    if (newToken) {
      header['Authorization'] = `Bearer ${newToken}`
      const retry = await Taro.request({ url, method, header, data: options.body })
      if (retry.statusCode >= 400) {
        throw new Error(retry.data?.message || `Query error: ${retry.statusCode}`)
      }
      return retry.data as T
    }
    // 刷新失败 → 跳转登录
    Taro.reLaunch({ url: '/pages/index/index' })
    throw new Error('登录已过期，请重新登录')
  }

  if (res.statusCode >= 400) {
    throw new Error(res.data?.message || `Query error: ${res.statusCode}`)
  }
  return res.data as T
}

// ---- base64url 解码（小程序环境无 atob） ----

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64UrlDecode(str: string): string {
  // base64url → base64
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) base64 += '='

  const bytes: number[] = []
  for (let i = 0; i < base64.length; i += 4) {
    const a = BASE64_CHARS.indexOf(base64[i])
    const b = BASE64_CHARS.indexOf(base64[i + 1])
    const c = BASE64_CHARS.indexOf(base64[i + 2])
    const d = BASE64_CHARS.indexOf(base64[i + 3])
    bytes.push((a << 2) | (b >> 4))
    if (c !== -1 && base64[i + 2] !== '=') bytes.push(((b & 15) << 4) | (c >> 2))
    if (d !== -1 && base64[i + 3] !== '=') bytes.push(((c & 3) << 6) | d)
  }

  // UTF-8 字节 → 字符串
  let result = ''
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i])
  }
  return result
}

export { SUPABASE_URL, SUPABASE_ANON_KEY }
