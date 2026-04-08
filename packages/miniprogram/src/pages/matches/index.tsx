import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery, getUserIdFromToken } from '../../lib/supabase'
import { requireAuth } from '../../lib/auth'
import './index.scss'

interface MatchResult {
  id: string
  best_slot: string | null
  rank: number | null
  created_at: string
  status: string | null
  member_a_id: string
  member_b_id: string
}

interface MatchWithPartner {
  match: MatchResult
  partnerName: string
  reviewed: boolean
}

export default function Matches() {
  const [matches, setMatches] = useState<MatchWithPartner[]>([])
  const [myMemberId, setMyMemberId] = useState('')
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
      setMyMemberId(memberId)

      // 查询作为 member_a 的匹配
      const matchesA = await supabaseQuery<MatchResult[]>('match_results', {
        select: 'id,best_slot,rank,created_at,status,member_a_id,member_b_id',
        member_a_id: `eq.${memberId}`,
        order: 'created_at.desc',
      })

      // 查询作为 member_b 的匹配
      const matchesB = await supabaseQuery<MatchResult[]>('match_results', {
        select: 'id,best_slot,rank,created_at,status,member_a_id,member_b_id',
        member_b_id: `eq.${memberId}`,
        order: 'created_at.desc',
      })

      const allMatches = [...(matchesA || []), ...(matchesB || [])]

      // 收集搭档 ID，批量查询姓名
      const partnerIds = allMatches.map(m =>
        m.member_a_id === memberId ? m.member_b_id : m.member_a_id
      )

      if (partnerIds.length === 0) {
        setMatches([])
        return
      }

      // 批量查搭档姓名
      const identities = await supabaseQuery<{ member_id: string; full_name: string | null; nickname: string | null }[]>(
        'member_identity',
        {
          select: 'member_id,full_name,nickname',
          member_id: `in.(${partnerIds.join(',')})`,
        }
      )

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

      const result: MatchWithPartner[] = allMatches.map(m => {
        const partnerId = m.member_a_id === memberId ? m.member_b_id : m.member_a_id
        return {
          match: m,
          partnerName: nameMap.get(partnerId) || '未知成员',
          reviewed: reviewedSet.has(m.id),
        }
      })

      setMatches(result)
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
        matches.map(({ match, partnerName, reviewed }) => (
          <View key={match.id} className="match-card"
            onClick={() => Taro.navigateTo({ url: `/pages/matches/detail?id=${match.id}` })}>
            <View className="match-header">
              <Text className="partner-name">{partnerName}</Text>
              {match.best_slot && (
                <Text className="slot-tag">{match.best_slot}</Text>
              )}
            </View>
            <View className="match-meta">
              <Text className="match-date">
                {new Date(match.created_at).toLocaleDateString('zh-CN')}
              </Text>
              {match.rank != null && (
                <Text className="match-rank">排名 #{match.rank}</Text>
              )}
            </View>
            {reviewed ? (
              <View className="review-btn reviewed">
                <Text className="review-btn-text reviewed-text">已评价</Text>
              </View>
            ) : (
              <View className="review-btn" onClick={() => {
                const revieweeId = match.member_a_id === myMemberId ? match.member_b_id : match.member_a_id
                Taro.navigateTo({ url: `/pages/review/index?matchId=${match.id}&revieweeId=${revieweeId}` })
              }}>
                <Text className="review-btn-text">评价</Text>
              </View>
            )}
          </View>
        ))
      )}
    </View>
  )
}
