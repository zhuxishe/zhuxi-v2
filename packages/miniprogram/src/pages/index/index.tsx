import { View, Text, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { wechatLogin } from '../../lib/auth'
import { getUserIdFromToken, isLoggedIn, supabaseQuery } from '../../lib/supabase'
import { resolveMiniHomeRoute } from '../../lib/home-route'
import { loadMiniRoundState } from '../../lib/open-round'
import { calcMiniProfileCompleteness } from '../../lib/profile-completeness'
import { HomeDashboard } from './HomeDashboard'
import { HomeErrorView } from './HomeErrorView'
import { HomeStatusView } from './HomeStatusView'
import { DashboardData } from './types'
import './index.scss'

type HomeView = 'pending' | 'rejected' | 'home'

export default function Index() {
  const [loading, setLoading] = useState(false)
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [dashLoading, setDashLoading] = useState(false)
  const [homeView, setHomeView] = useState<HomeView | null>(null)
  const [loadError, setLoadError] = useState('')

  useDidShow(() => {
    if (isLoggedIn()) {
      setLoggedIn(true)
      loadDashboard()
    }
  })

  const handleLogin = async () => {
    setLoading(true)
    try {
      const result = await wechatLogin()
      setLoggedIn(true)
      Taro.showToast({ title: result.isNewUser ? '注册成功' : '登录成功', icon: 'success' })
      loadDashboard()
    } catch {
      Taro.showToast({ title: '登录失败，请重试', icon: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const loadDashboard = async () => {
    setDashLoading(true)
    setLoadError('')
    try {
      const userId = getUserIdFromToken()
      if (!userId) throw new Error('登录状态已失效，请重新登录')

      const member = await supabaseQuery<any>('members', {
        select: [
          'id',
          'status',
          'member_identity(full_name)',
          'member_language(communication_language_pref)',
          'member_interests(activity_frequency)',
          'member_personality(expression_style_tags,extroversion,initiative,emotional_stability,warmup_speed)',
          'personality_quiz_results(score_e)',
        ].join(','),
        user_id: `eq.${userId}`,
      }, { single: true })

      const identity = Array.isArray(member?.member_identity) ? member.member_identity[0] : member?.member_identity
      const hasIdentity = !!identity?.full_name
      const route = resolveMiniHomeRoute(
        member ? { status: member.status, hasIdentity } : null
      )

      if (route.action === 'redirect') {
        Taro.navigateTo({ url: route.to })
        return
      }

      setHomeView(route.view)
      if (route.view !== 'home') return

      const completeness = calcMiniProfileCompleteness({
        member_identity: member.member_identity,
        member_language: member.member_language,
        member_interests: member.member_interests,
        member_personality: member.member_personality,
        personality_quiz_results: member.personality_quiz_results,
      })
      const roundState = await loadMiniRoundState(member.id)

      setDashboard({
        name: identity?.full_name || '新成员',
        status: member.status,
        completeness,
        openRound: roundState.openRound,
        hasSubmission: roundState.hasSubmission,
      })
    } catch (err) {
      console.error('加载仪表盘失败:', err)
      setDashboard(null)
      setHomeView(null)
      setLoadError(err instanceof Error ? err.message : '首页加载失败，请稍后重试')
    } finally {
      setDashLoading(false)
    }
  }

  return (
    <View className="index">
      <View className="header">
        <Text className="title">zhuxishe</Text>
        <Text className="subtitle">个人记事本</Text>
      </View>

      {!loggedIn ? (
        <View className="content">
          <Button className="login-btn" onClick={handleLogin} disabled={loading}>
            {loading ? '登录中...' : '微信登录'}
          </Button>
        </View>
      ) : dashLoading ? (
        <Text className="dash-loading">加载中...</Text>
      ) : loadError ? (
        <HomeErrorView message={loadError} onRetry={loadDashboard} />
      ) : homeView === 'pending' ? (
        <HomeStatusView onEdit={() => Taro.navigateTo({ url: '/pages/interview/index' })} />
      ) : homeView === 'rejected' ? (
        <HomeStatusView rejected />
      ) : dashboard ? (
        <HomeDashboard dashboard={dashboard} />
      ) : null}
    </View>
  )
}
