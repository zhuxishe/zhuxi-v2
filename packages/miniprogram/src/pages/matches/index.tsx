import { View, Text } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery, getUserIdFromToken } from '../../lib/supabase'
import { requireAuth } from '../../lib/auth'
import MatchCard from './MatchCard'
import { buildMiniMatchList, type MiniMatchListItem, type MiniMatchResult } from './match-list'
import './index.scss'

export default function Matches() {
  const [matches, setMatches] = useState<MiniMatchListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useDidShow(() => {
    if (!requireAuth()) return
    loadMatches()
  })

  const loadMatches = async () => {
    setLoading(true)
    setError('')
    try {
      const userId = getUserIdFromToken()
      if (!userId) throw new Error('未登录')

      // 获取当前用户的 member_id
      const members = await supabaseQuery<{ id: string }[]>('members', {
        select: 'id', user_id: `eq.${userId}`,
      })
      if (!members?.length) throw new Error('未找到会员记录')
      const memberId = members[0].id

      const allMatches = await supabaseQuery<MiniMatchResult[]>('match_results', {
        select: 'id,best_slot,rank,created_at,status,member_a_id,member_b_id,group_members',
        or: `member_a_id.eq.${memberId},member_b_id.eq.${memberId},group_members.cs.{${memberId}}`,
        order: 'created_at.desc',
      })

      const partnerIds = new Set<string>()
      for (const match of allMatches || []) {
        if (match.member_a_id !== memberId) partnerIds.add(match.member_a_id)
        if (match.member_b_id !== memberId) partnerIds.add(match.member_b_id)
        for (const groupMemberId of match.group_members || []) {
          if (groupMemberId !== memberId) partnerIds.add(groupMemberId)
        }
      }

      if (allMatches.length === 0) {
        setMatches([])
        return
      }

      const identities = partnerIds.size > 0
        ? await supabaseQuery<{ member_id: string; full_name: string | null; nickname: string | null }[]>(
          'member_identity',
          {
            select: 'member_id,full_name,nickname',
            member_id: `in.(${[...partnerIds].join(',')})`,
          }
        )
        : []

      const nameMap = new Map<string, string>()
      identities?.forEach(i => {
        nameMap.set(i.member_id, i.full_name || i.nickname || '未知')
      })

      // 查已评价的 match_result_id
      const matchIds = allMatches.map(m => m.id)
      const reviewedSet = new Set<string>()
      if (matchIds.length) {
        const reviews = await supabaseQuery<{ match_result_id: string }[]>('mutual_reviews', {
          select: 'match_result_id',
          reviewer_id: `eq.${memberId}`,
          match_result_id: `in.(${matchIds.join(',')})`,
        })
        reviews?.forEach(r => reviewedSet.add(r.match_result_id))
      }

      setMatches(buildMiniMatchList(memberId, allMatches, nameMap, reviewedSet))
    } catch (err: any) {
      console.error('加载匹配失败:', err)
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <View className="matches-page">
        <Text className="loading">加载中...</Text>
      </View>
    )
  }

  if (error) {
    return (
      <View className="matches-page">
        <Text className="error">{error}</Text>
      </View>
    )
  }

  return (
    <View className="matches-page">
      {matches.length === 0 ? (
        <View className="empty">
          <Text className="empty-text">暂无匹配记录</Text>
          <Text className="empty-hint">管理员发起匹配后，结果会显示在这里</Text>
        </View>
      ) : (
        matches.map((item) => <MatchCard key={item.match.id} item={item} />)
      )}
    </View>
  )
}
