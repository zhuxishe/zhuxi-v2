import { supabaseQuery, getUserIdFromToken } from './supabase'

let cachedMember: { userId: string; memberId: string } | null = null

/** 获取当前用户的 member_id（带缓存） */
export async function getMemberId(): Promise<string> {
  const userId = getUserIdFromToken()
  if (!userId) throw new Error('未登录')
  if (cachedMember?.userId === userId) return cachedMember.memberId

  const members = await supabaseQuery<{ id: string }[]>('members', {
    select: 'id',
    user_id: `eq.${userId}`,
  })

  if (!members?.length) throw new Error('未找到会员记录')
  cachedMember = { userId, memberId: members[0].id }
  return cachedMember.memberId
}

/** 登出时清除缓存 */
export function clearMemberCache() {
  cachedMember = null
}
