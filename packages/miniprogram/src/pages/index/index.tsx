import { View, Text, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { wechatLogin } from '../../lib/auth'
import { isLoggedIn, getUserIdFromToken, supabaseQuery } from '../../lib/supabase'
import './index.scss'

interface DashboardData {
  name: string
  status: string
  hasIdentity: boolean
  hasLanguage: boolean
  hasInterests: boolean
  openRound: { id: string; name: string; survey_end: string } | null
  hasSubmission: boolean
}

const STATUS_MAP: Record<string, string> = {
  pending: '待审核', approved: '已批准', rejected: '已拒绝',
}
const STATUS_COLOR: Record<string, string> = {
  pending: 'warning', approved: 'success', rejected: 'error',
}

export default function Index() {
  const [loading, setLoading] = useState(false)
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [dashLoading, setDashLoading] = useState(false)

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
    } catch (err) {
      Taro.showToast({ title: '登录失败，请重试', icon: 'error' })
    } finally { setLoading(false) }
  }

  const loadDashboard = async () => {
    setDashLoading(true)
    try {
      const userId = getUserIdFromToken()
      if (!userId) return

      const member = await supabaseQuery<any>('members', {
        select: 'id,status,member_identity(full_name),member_language(id),member_interests(id)',
        user_id: `eq.${userId}`,
      }, { single: true })

      if (!member) return

      const identity = Array.isArray(member.member_identity) ? member.member_identity[0] : member.member_identity
      const hasIdentity = !!identity?.full_name
      const hasLanguage = !!(Array.isArray(member.member_language) ? member.member_language.length : member.member_language)
      const hasInterests = !!(Array.isArray(member.member_interests) ? member.member_interests.length : member.member_interests)

      // 无档案 → 跳转面试表单
      if (!hasIdentity) {
        Taro.navigateTo({ url: '/pages/interview/index' })
        setDashLoading(false)
        return
      }

      // 查开放轮次
      let openRound: DashboardData['openRound'] = null
      let hasSubmission = false
      try {
        const rounds = await supabaseQuery<any[]>('match_rounds', {
          select: 'id,name,survey_end', status: 'eq.open', limit: '1',
        })
        if (rounds?.length) {
          openRound = rounds[0]
          const subs = await supabaseQuery<any[]>('match_round_submissions', {
            select: 'id', round_id: `eq.${rounds[0].id}`, member_id: `eq.${member.id}`,
          })
          hasSubmission = !!(subs?.length)
        }
      } catch { /* 无开放轮次 */ }

      setDashboard({
        name: identity.full_name, status: member.status,
        hasIdentity, hasLanguage, hasInterests,
        openRound, hasSubmission,
      })
    } catch (err) {
      console.error('加载仪表盘失败:', err)
    } finally { setDashLoading(false) }
  }

  return (
    <View className="index">
      <View className="header">
        <Text className="title">竹溪社</Text>
        <Text className="subtitle">剧本杀社团</Text>
      </View>

      {!loggedIn ? (
        <View className="content">
          <Button className="login-btn" onClick={handleLogin} disabled={loading}>
            {loading ? '登录中...' : '微信登录'}
          </Button>
        </View>
      ) : dashLoading ? (
        <Text className="dash-loading">加载中...</Text>
      ) : dashboard ? (
        <View className="dashboard">
          {/* 欢迎 + 状态 */}
          <View className="welcome-card">
            <Text className="welcome-name">你好，{dashboard.name}</Text>
            <View className={`status-badge ${STATUS_COLOR[dashboard.status] || ''}`}>
              <Text className="status-text">{STATUS_MAP[dashboard.status] || dashboard.status}</Text>
            </View>
          </View>

          {/* 问卷状态 */}
          {dashboard.openRound && (
            <View className="card" onClick={!dashboard.hasSubmission ? () => Taro.navigateTo({ url: '/pages/survey/index' }) : undefined}>
              <Text className="card-label">当前匹配轮次</Text>
              <Text className="card-value">{dashboard.openRound.name || '匹配进行中'}</Text>
              {dashboard.hasSubmission ? (
                <Text className="card-status done">已提交问卷</Text>
              ) : (
                <Text className="card-status todo">未提交 — 点击填写</Text>
              )}
              {dashboard.openRound.survey_end && (
                <Text className="card-hint">截止: {new Date(dashboard.openRound.survey_end).toLocaleDateString('zh-CN')}</Text>
              )}
            </View>
          )}

          {/* 档案完成度 */}
          <View className="card">
            <Text className="card-label">档案完成度</Text>
            <View className="progress-items">
              <ProgressItem label="身份信息" done={dashboard.hasIdentity} />
              <ProgressItem label="语言偏好" done={dashboard.hasLanguage} />
              <ProgressItem label="活动偏好" done={dashboard.hasInterests} />
            </View>
          </View>

          {/* 功能菜单 */}
          <View className="menu-list">
            <MenuItem title="我的匹配" desc="查看匹配结果" onClick={() => Taro.navigateTo({ url: '/pages/matches/index' })} />
            <MenuItem title="剧本库" desc="浏览已发布的剧本" onClick={() => Taro.navigateTo({ url: '/pages/scripts/index' })} />
            <MenuItem title="活动记录" desc="参加过的活动" onClick={() => Taro.navigateTo({ url: '/pages/activities/index' })} />
            <MenuItem title="性格测试" desc="15 题了解你的社交人格" onClick={() => Taro.navigateTo({ url: '/pages/quiz/index' })} />
          </View>
        </View>
      ) : null}
    </View>
  )
}

function MenuItem({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) {
  return (
    <View className="menu-item" onClick={onClick}>
      <View className="menu-text">
        <Text className="menu-title">{title}</Text>
        <Text className="menu-desc">{desc}</Text>
      </View>
      <Text className="menu-arrow">›</Text>
    </View>
  )
}

function ProgressItem({ label, done }: { label: string; done: boolean }) {
  return (
    <View className="progress-item">
      <Text className={`progress-dot ${done ? 'done' : ''}`}>{done ? '✓' : '○'}</Text>
      <Text className="progress-label">{label}</Text>
    </View>
  )
}
