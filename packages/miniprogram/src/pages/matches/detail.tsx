import { View, Text } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery } from '../../lib/supabase'
import { getMemberId } from '../../lib/member'
import { asMiniStringArray, buildMiniMatchTagGroups, emptyMiniPartnerProfile, isMiniMatchParticipant, resolveMiniMatchPartner } from '../../lib/match-detail'
import { MatchCancellationCard } from './MatchCancellationCard'
import { MatchReviewEntry } from './MatchReviewEntry'
import { MatchTagGroups } from './MatchTagGroups'
import { MatchDetail } from './match-detail-types'
import './detail.scss'

export default function MatchDetailPage() {
  const router = useRouter()
  const { id } = router.params
  const [match, setMatch] = useState<MatchDetail | null>(null)
  const [partnerName, setPartnerName] = useState('搭档')
  const [groupMemberNames, setGroupMemberNames] = useState<string[]>([])
  const [revieweeId, setRevieweeId] = useState<string | null>(null)
  const [isGroup, setIsGroup] = useState(false)
  const [sessionName, setSessionName] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [tagGroups, setTagGroups] = useState<{ label: string; tags: string[] }[]>([])
  const [myId, setMyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useDidShow(() => { if (id) loadData() })

  async function loadData() {
    setLoading(true)
    try {
      const memberId = await getMemberId()
      setMyId(memberId)
      const data = await supabaseQuery<MatchDetail>('match_results', {
        select: 'id,best_slot,rank,status,created_at,group_members,session_id,member_a_id,member_b_id,cancellation_status,cancellation_reason,cancellation_requested_at',
        id: `eq.${id}`,
      }, { single: true })
      if (!isMiniMatchParticipant(memberId, data)) {
        setMatch(null)
        Taro.showToast({ title: '无权查看该匹配', icon: 'none' })
        return
      }
      setMatch(data)
      if (data) await hydrateDisplay(data, memberId)
    } catch (err) {
      console.error('加载失败:', err)
    } finally {
      setLoading(false)
    }
  }

  async function hydrateDisplay(data: MatchDetail, memberId: string) {
    const ids = Array.isArray(data.group_members) && data.group_members.length > 0 ? data.group_members.filter((item) => item !== memberId) : [data.member_a_id === memberId ? data.member_b_id : data.member_a_id]
    const [names, reviews, sessions] = await Promise.all([
      ids.length ? supabaseQuery<any[]>('member_identity', { select: 'member_id,full_name,nickname', member_id: `in.(${ids.join(',')})` }) : Promise.resolve([]),
      supabaseQuery<any[]>('mutual_reviews', { select: 'id', reviewer_id: `eq.${memberId}`, match_result_id: `eq.${data.id}` }),
      data.session_id ? supabaseQuery<any[]>('match_sessions', { select: 'session_name', id: `eq.${data.session_id}` }) : Promise.resolve([]),
    ])
    const nameMap = new Map<string, string>()
    names?.forEach((item) => nameMap.set(item.member_id, item.full_name || item.nickname || '未知'))
    const resolved = resolveMiniMatchPartner(memberId, data.group_members, nameMap, data)
    setPartnerName(resolved.partnerName)
    setGroupMemberNames(resolved.groupMemberNames)
    setRevieweeId(resolved.revieweeId)
    setIsGroup(resolved.isGroup)
    setReviewed(!!reviews?.length)
    if (sessions?.length) setSessionName(sessions[0].session_name || '')
    if (!resolved.isGroup && resolved.revieweeId) {
      const [identityRows, interestRows, personalityRows] = await Promise.all([
        supabaseQuery<any[]>('member_identity', { select: 'hobby_tags', member_id: `eq.${resolved.revieweeId}` }),
        supabaseQuery<any[]>('member_interests', { select: 'game_type_pref,scenario_theme_tags', member_id: `eq.${resolved.revieweeId}` }),
        supabaseQuery<any[]>('member_personality', { select: 'expression_style_tags,group_role_tags', member_id: `eq.${resolved.revieweeId}` }),
      ])
      const profile = {
        hobbyTags: asMiniStringArray(identityRows?.[0]?.hobby_tags),
        gameTypePref: interestRows?.[0]?.game_type_pref || null,
        scenarioThemeTags: asMiniStringArray(interestRows?.[0]?.scenario_theme_tags),
        expressionStyleTags: asMiniStringArray(personalityRows?.[0]?.expression_style_tags),
        groupRoleTags: asMiniStringArray(personalityRows?.[0]?.group_role_tags),
      }
      setTagGroups(buildMiniMatchTagGroups(profile))
      return
    }
    setTagGroups(buildMiniMatchTagGroups(emptyMiniPartnerProfile()))
  }

  async function handleCancel() {
    if (!match) return
    setSubmitting(true)
    try {
      await supabaseQuery('match_results', { id: `eq.${match.id}`, cancellation_status: 'is.null', status: 'neq.cancelled' }, { method: 'PATCH', body: { cancellation_status: 'pending', cancellation_requested_by: myId, cancellation_reason: cancelReason.trim() || null, cancellation_requested_at: new Date().toISOString() } })
      Taro.showToast({ title: '申请已提交', icon: 'success' })
      setShowCancel(false)
      loadData()
    } catch (err: any) {
      Taro.showToast({ title: err.message || '提交失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <View className="detail-page"><Text className="loading">加载中...</Text></View>
  if (!match) return <View className="detail-page"><Text className="error">未找到匹配</Text></View>

  return (
    <View className="detail-page">
      <View className="card">
        <Text className="partner-name">{partnerName}</Text>
        {sessionName ? <Text className="session-name">{sessionName}</Text> : null}
        {isGroup && groupMemberNames.length ? <Text className="group-members">组员：{groupMemberNames.join('、')}</Text> : null}
        <View className="info-grid">
          {match.best_slot ? <InfoItem label="推荐时段" value={match.best_slot} /> : null}
          {match.rank != null ? <InfoItem label="排名" value={`#${match.rank}`} /> : null}
          <InfoItem label="日期" value={new Date(match.created_at).toLocaleDateString('zh-CN')} />
          <InfoItem label="状态" value={match.status || 'active'} />
        </View>
        <MatchTagGroups groups={tagGroups} />
      </View>
      <MatchCancellationCard match={match} showCancel={showCancel} cancelReason={cancelReason} submitting={submitting} onReasonChange={setCancelReason} onShowCancel={setShowCancel} onSubmit={handleCancel} />
      <MatchReviewEntry isGroup={isGroup} reviewed={reviewed} matchId={match.id} revieweeId={revieweeId} />
    </View>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return <View className="info-item"><Text className="info-label">{label}</Text><Text className="info-value">{value}</Text></View>
}
