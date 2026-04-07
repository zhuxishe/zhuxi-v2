import Taro from '@tarojs/taro'
import { callEdgeFunction, saveSession, clearSession, isLoggedIn } from './supabase'

interface AuthResponse {
  session: {
    access_token: string
    refresh_token: string
  }
  member: {
    id: string
    status: string
  }
  isNewUser: boolean
}

/** 微信登录 → Supabase Auth 完整流程 */
export async function wechatLogin(): Promise<AuthResponse> {
  // 1. 调用 wx.login 获取 code
  const loginRes = await Taro.login()
  if (!loginRes.code) {
    throw new Error('微信登录失败，未获取到 code')
  }

  // 2. 发送 code 到 Edge Function，换取 session
  const result = await callEdgeFunction<AuthResponse>('wechat-auth', {
    code: loginRes.code,
  })

  // 3. 保存 session 到本地
  saveSession(result.session)

  return result
}

/** 登出 */
export function logout() {
  clearSession()
  Taro.reLaunch({ url: '/pages/index/index' })
}

/** 检查登录状态，未登录跳转到首页 */
export function requireAuth() {
  if (!isLoggedIn()) {
    Taro.reLaunch({ url: '/pages/index/index' })
    return false
  }
  return true
}

export { isLoggedIn }
