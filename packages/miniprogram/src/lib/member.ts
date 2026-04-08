import { supabaseQuery, getUserIdFromToken } from './supabase'

let cachedMemberId: string | null = null

/** 获取当前用户的 member_id（带缓存） */
export async function getMemberId(): Promise<string> {
  if (cachedMemberId) return cachedMemberId

  const userId = getUserIdFromToken()
  if (!userId) throw new Error('未登录')

  const members = await supabaseQuery<{ id: string }[]>('members', {
    select: 'id',
    user_id: `eq.${userId}`,
  })

  if (!members?.length) throw new Error('未找到会员记录')
  cachedMemberId = members[0].id
  return cachedMemberId
}

/** 登出时清除缓存 */
export function clearMemberCache() {
  cachedMemberId = null
}
