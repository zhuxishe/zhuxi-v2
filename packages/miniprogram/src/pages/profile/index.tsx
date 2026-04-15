import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery, getUserIdFromToken } from '../../lib/supabase'
import { requireAuth, logout } from '../../lib/auth'
import { ProfileStatsCard } from './ProfileStatsCard'
import { RecentActivitiesCard } from './RecentActivitiesCard'
import { OpenRoundCard } from './OpenRoundCard'
import { ProfileSections } from './ProfileSections'
import { ProfileData, unwrap } from './profile-data'
import { filterMiniActivitiesByMember, MiniActivityItem, MiniActivityRow } from './profile-activities'
import { buildMiniRoundCardState, MiniOpenRound } from '../../lib/round-state'
import { loadMiniRoundState } from '../../lib/open-round'
import './index.scss'

export default function Profile() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [activities, setActivities] = useState<MiniActivityItem[]>([])
  const [openRound, setOpenRound] = useState<MiniOpenRound | null>(null)
  const [hasSubmission, setHasSubmission] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useDidShow(() => { if (requireAuth()) loadProfile() })

  function handleLogout() {
    Taro.showModal({ title: '确认退出', content: '退出后需要重新登录', success: (res) => { if (res.confirm) logout() } })
  }

  async function loadProfile() {
    setLoading(true)
    setError('')
    try {
      const userId = getUserIdFromToken()
      if (!userId) throw new Error('无法获取用户 ID')
      const data = await supabaseQuery<ProfileData>('members', {
        select: [
          'id', 'member_number', 'status', 'email',
          'member_identity(full_name,nickname,gender,age_range,school_name,department,degree_level,course_language,enrollment_year,hobby_tags,activity_type_tags,personality_self_tags,taboo_tags)',
          'member_language(*)',
          'member_interests(activity_area,activity_frequency,game_type_pref,scenario_mode_pref,budget_range,preferred_time_slots,ideal_group_size,travel_radius,script_preference,non_script_preference)',
          'member_personality(expression_style_tags,group_role_tags,warmup_speed,planning_style,coop_compete_tendency,extroversion,initiative,emotional_stability,boundary_strength,reply_speed)',
          'personality_quiz_results(score_e,score_a,score_c,score_o,score_n,personality_type)',
          'member_dynamic_stats(activity_count,review_count,avg_review_score)',
        ].join(','),
        user_id: `eq.${userId}`,
      }, { single: true })
      setProfile(data)
      try {
        const activityRows = await supabaseQuery<MiniActivityRow[]>('activity_records', {
          select: 'id,title,location,activity_date,participant_ids',
          order: 'activity_date.desc',
          limit: '200',
        })
        setActivities(filterMiniActivitiesByMember(activityRows, data.id).slice(0, 10))
      } catch (err) {
        console.warn('加载活动记录失败:', err)
        setActivities([])
      }

      try {
        const roundState = await loadMiniRoundState(data.id)
        setOpenRound(roundState.openRound as MiniOpenRound | null)
        setHasSubmission(roundState.hasSubmission)
      } catch (err) {
        console.warn('加载当前轮次失败:', err)
        setOpenRound(null)
        setHasSubmission(false)
      }
    } catch (err: any) {
      console.error('加载档案失败:', err)
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <View className="profile"><Text className="loading">加载中...</Text></View>
  if (error || !profile) return <View className="profile"><Text className="error">{error || '未找到档案'}</Text></View>

  const stats = unwrap(profile.member_dynamic_stats)
  const roundCard = buildMiniRoundCardState(openRound, hasSubmission)
  return (
    <View className="profile">
      <OpenRoundCard card={roundCard} />
      <ProfileStatsCard activityCount={stats?.activity_count || 0} reviewCount={stats?.review_count || 0} avgReviewScore={stats?.avg_review_score ?? null} />
      <RecentActivitiesCard activities={activities} />
      <ProfileSections profile={profile} />
      <View className="logout-btn" onClick={handleLogout}><Text className="logout-text">退出登录</Text></View>
    </View>
  )
}
