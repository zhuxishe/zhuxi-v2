import { View, Text } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery } from '../../lib/supabase'
import { getMemberId } from '../../lib/member'
import { requireAuth } from '../../lib/auth'
import './index.scss'

interface Activity {
  id: string
  title: string
  activity_date: string | null
  activity_type: string | null
  location: string | null
  participant_count: number | null
  duration_minutes: number | null
}

export default function Activities() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useDidShow(() => {
    if (!requireAuth()) return
    loadActivities()
  })

  const loadActivities = async () => {
    setLoading(true)
    try {
      const memberId = await getMemberId()
      const data = await supabaseQuery<Activity[]>('activity_records', {
        select: 'id,title,activity_date,activity_type,location,participant_count,duration_minutes',
        participant_ids: `cs.{${memberId}}`,
        order: 'activity_date.desc',
      })
      setActivities(data || [])
    } catch (err) {
      console.error('加载活动失败:', err)
    } finally { setLoading(false) }
  }

  if (loading) return <View className="activities-page"><Text className="loading">加载中...</Text></View>

  return (
    <View className="activities-page">
      {activities.length === 0 ? (
        <View className="empty">
          <Text className="empty-text">暂无活动记录</Text>
          <Text className="empty-hint">参加活动后，记录会显示在这里</Text>
        </View>
      ) : (
        activities.map(a => (
          <View key={a.id} className="activity-card">
            <Text className="activity-title">{a.title}</Text>
            <View className="activity-meta">
              {a.activity_date && <Text className="meta-item">{new Date(a.activity_date).toLocaleDateString('zh-CN')}</Text>}
              {a.activity_type && <Text className="meta-tag">{a.activity_type}</Text>}
              {a.location && <Text className="meta-item">{a.location}</Text>}
            </View>
            <View className="activity-stats">
              {a.participant_count && <Text className="stat">{a.participant_count} 人参加</Text>}
              {a.duration_minutes && <Text className="stat">{a.duration_minutes} 分钟</Text>}
            </View>
          </View>
        ))
      )}
    </View>
  )
}
