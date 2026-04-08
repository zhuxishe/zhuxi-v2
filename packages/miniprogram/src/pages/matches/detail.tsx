import { View, Text, Textarea } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery } from '../../lib/supabase'
import { getMemberId } from '../../lib/member'
import './detail.scss'

interface MatchDetail {
  id: string
  best_slot: string | null
  rank: number | null
  status: string | null
  created_at: string
  member_a_id: string
  member_b_id: string
  cancellation_status: string | null
  cancellation_reason: string | null
  cancellation_requested_at: string | null
}

const CANCEL_STATUS: Record<string, string> = {
  pending: '审核中', approved: '已批准', rejected: '已拒绝',
}

export default function MatchDetail() {
  const router = useRouter()
  const { id } = router.params

  const [match, setMatch] = useState<MatchDetail | null>(null)
  const [partnerName, setPartnerName] = useState('')
  const [myId, setMyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useDidShow(() => { if (id) loadData() })

  const loadData = async () => {
    setLoading(true)
    try {
      const memberId = await getMemberId()
      setMyId(memberId)

      const data = await supabaseQuery<MatchDetail>('match_results', {
        select: 'id,best_slot,rank,status,created_at,member_a_id,member_b_id,cancellation_status,cancellation_reason,cancellation_requested_at',
        id: `eq.${id}`,
      }, { single: true })

      setMatch(data)

      if (data) {
        const partnerId = data.member_a_id === memberId ? data.member_b_id : data.member_a_id
        const names = await supabaseQuery<any[]>('member_identity', {
          select: 'full_name,nickname', member_id: `eq.${partnerId}`,
        })
        if (names?.length) setPartnerName(names[0].full_name || names[0].nickname || '未知')
      }
    } catch (err) {
      console.error('加载失败:', err)
    } finally { setLoading(false) }
  }

  const handleCancel = async () => {
    if (!match) return
    setSubmitting(true)
    try {
      await supabaseQuery('match_results', { id: `eq.${match.id}` }, {
        method: 'PATCH',
        body: {
          cancellation_status: 'pending',
          cancellation_requested_by: myId,
          cancellation_reason: cancelReason.trim() || null,
          cancellation_requested_at: new Date().toISOString(),
        },
      })
      Taro.showToast({ title: '申请已提交', icon: 'success' })
      setShowCancel(false)
      loadData()
    } catch (err: any) {
      Taro.showToast({ title: err.message || '提交失败', icon: 'none' })
    } finally { setSubmitting(false) }
  }

  if (loading) return <View className="detail-page"><Text className="loading">加载中...</Text></View>
  if (!match) return <View className="detail-page"><Text className="error">未找到匹配</Text></View>

  const canCancel = match.status !== 'cancelled' && !match.cancellation_status

  return (
    <View className="detail-page">
      <View className="card">
        <Text className="partner-name">{partnerName || '搭档'}</Text>
        <View className="info-grid">
          {match.best_slot && <InfoItem label="推荐时段" value={match.best_slot} />}
          {match.rank != null && <InfoItem label="排名" value={`#${match.rank}`} />}
          <InfoItem label="日期" value={new Date(match.created_at).toLocaleDateString('zh-CN')} />
          <InfoItem label="状态" value={match.status || 'active'} />
        </View>
      </View>

      {/* 取消状态 */}
      {match.cancellation_status && (
        <View className="card cancel-card">
          <Text className="cancel-title">取消申请</Text>
          <View className={`cancel-badge ${match.cancellation_status}`}>
            <Text className="cancel-badge-text">{CANCEL_STATUS[match.cancellation_status] || match.cancellation_status}</Text>
          </View>
          {match.cancellation_reason && <Text className="cancel-reason">原因: {match.cancellation_reason}</Text>}
          {match.cancellation_requested_at && (
            <Text className="cancel-time">申请时间: {new Date(match.cancellation_requested_at).toLocaleDateString('zh-CN')}</Text>
          )}
        </View>
      )}

      {/* 取消按钮 */}
      {canCancel && !showCancel && (
        <View className="cancel-btn" onClick={() => setShowCancel(true)}>
          <Text className="cancel-btn-text">申请取消匹配</Text>
        </View>
      )}

      {showCancel && (
        <View className="card">
          <Text className="section-title">取消原因（可选）</Text>
          <Textarea className="reason-input" value={cancelReason} placeholder="说明取消原因..."
            maxlength={200} onInput={e => setCancelReason(e.detail.value)} />
          <View className="cancel-actions">
            <View className="action-btn secondary" onClick={() => setShowCancel(false)}>
              <Text className="action-text sec-text">取消</Text>
            </View>
            <View className="action-btn danger" onClick={!submitting ? handleCancel : undefined}>
              <Text className="action-text danger-text">{submitting ? '提交中...' : '确认申请'}</Text>
            </View>
          </View>
        </View>
      )}

      {/* 评价入口 */}
      <View className="review-entry" onClick={() => {
        const revieweeId = match.member_a_id === myId ? match.member_b_id : match.member_a_id
        Taro.navigateTo({ url: `/pages/review/index?matchId=${match.id}&revieweeId=${revieweeId}` })
      }}>
        <Text className="review-entry-text">评价搭档</Text>
      </View>
    </View>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <View className="info-item">
      <Text className="info-label">{label}</Text>
      <Text className="info-value">{value}</Text>
    </View>
  )
}
