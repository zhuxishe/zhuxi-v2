import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery, getUserIdFromToken } from '../../lib/supabase'
import { requireAuth, logout } from '../../lib/auth'
import './index.scss'

interface ProfileData {
  id: string
  member_number: string | null
  status: string
  email: string | null
  member_identity: {
    full_name: string | null
    nickname: string | null
    gender: string | null
    age_range: string | null
    school_name: string | null
    department: string | null
    degree_level: string | null
    course_language: string | null
    enrollment_year: number | null
    hobby_tags: string[] | null
    activity_type_tags: string[] | null
    personality_self_tags: string[] | null
    taboo_tags: string[] | null
  }[] | null
  member_language: {
    japanese_level: string | null
    communication_language_pref: string[] | null
  }[] | null
  member_interests: {
    activity_area: string | null
    activity_frequency: string | null
    game_type_pref: string | null
    scenario_mode_pref: string[] | null
    budget_range: string | null
    preferred_time_slots: string[] | null
  }[] | null
  member_personality: {
    extroversion: number | null
    initiative: number | null
    emotional_stability: number | null
  }[] | null
  personality_quiz_results: {
    score_e: number | null
    score_a: number | null
    score_o: number | null
    score_c: number | null
    score_n: number | null
    personality_type: string | null
  }[] | null
}

const GENDER_MAP: Record<string, string> = {
  male: '男', female: '女', other: '其他',
}

const DEGREE_MAP: Record<string, string> = {
  undergraduate: '本科', master: '硕士', doctoral: '博士',
  exchange: '交换生', language_school: '语言学校', other: '其他',
}

const STATUS_MAP: Record<string, string> = {
  pending: '待审核', approved: '已批准', rejected: '已拒绝', inactive: '已停用',
}

export default function Profile() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useDidShow(() => {
    if (!requireAuth()) return
    loadProfile()
  })

  const handleLogout = () => {
    Taro.showModal({
      title: '确认退出',
      content: '退出后需要重新登录',
      success: (res) => {
        if (res.confirm) logout()
      },
    })
  }

  const loadProfile = async () => {
    setLoading(true)
    setError('')
    try {
      const userId = getUserIdFromToken()
      if (!userId) throw new Error('无法获取用户 ID')

      // 对齐 Web 端 fetchPlayerProfile 的查询逻辑
      const data = await supabaseQuery<ProfileData>(
        'members',
        {
          select: [
            'id', 'member_number', 'status', 'email',
            'member_identity(full_name,nickname,gender,age_range,school_name,department,degree_level,course_language,enrollment_year,hobby_tags,activity_type_tags,personality_self_tags,taboo_tags)',
            'member_language(*)',
            'member_interests(activity_area,activity_frequency,game_type_pref,scenario_mode_pref,budget_range,preferred_time_slots)',
            'member_personality(extroversion,initiative,emotional_stability)',
            'personality_quiz_results(score_e,score_a,score_c,score_o,score_n,personality_type)',
          ].join(','),
          user_id: `eq.${userId}`,
        },
        { single: true }
      )

      setProfile(data)
    } catch (err: any) {
      console.error('加载档案失败:', err)
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <View className="profile">
        <Text className="loading">加载中...</Text>
      </View>
    )
  }

  if (error || !profile) {
    return (
      <View className="profile">
        <Text className="error">{error || '未找到档案'}</Text>
      </View>
    )
  }

  // Supabase 1:1 关联可能返回数组或对象，统一取第一个
  const identity = unwrap(profile.member_identity)
  const lang = unwrap(profile.member_language)
  const interests = unwrap(profile.member_interests)
  const personality = unwrap(profile.member_personality)
  const quiz = unwrap(profile.personality_quiz_results)

  return (
    <View className="profile">
      {/* 基本信息 */}
      <View className="card">
        <CardHeader title="基本信息" onEdit={() => Taro.navigateTo({ url: '/pages/profile/edit-identity' })} />
        <InfoRow label="会员编号" value={profile.member_number || '待分配'} />
        <InfoRow label="状态" value={STATUS_MAP[profile.status] || profile.status} />
        {identity ? (
          <>
            <InfoRow label="姓名" value={identity.full_name || '-'} />
            <InfoRow label="昵称" value={identity.nickname || '-'} />
            <InfoRow label="性别" value={GENDER_MAP[identity.gender || ''] || '-'} />
            <InfoRow label="年龄段" value={identity.age_range || '-'} />
            <InfoRow label="学校" value={identity.school_name || '-'} />
            <InfoRow label="专业" value={identity.department || '-'} />
            {identity.degree_level && <InfoRow label="学历" value={DEGREE_MAP[identity.degree_level] || identity.degree_level} />}
            {identity.course_language && <InfoRow label="授课语言" value={identity.course_language} />}
            {identity.enrollment_year && <InfoRow label="入学年份" value={String(identity.enrollment_year)} />}
          </>
        ) : (
          <Text className="hint">尚未填写身份信息</Text>
        )}
      </View>

      {/* 语言 */}
      <View className="card">
        <CardHeader title="语言" onEdit={() => Taro.navigateTo({ url: '/pages/profile/edit-language' })} />
        {lang ? (
          <>
            <InfoRow label="日语水平" value={lang.japanese_level || '-'} />
            <InfoRow label="沟通语言" value={lang.communication_language_pref?.join(', ') || '-'} />
          </>
        ) : (
          <Text className="hint">尚未填写</Text>
        )}
      </View>

      {/* 活动偏好 */}
      <View className="card">
        <CardHeader title="活动偏好" onEdit={() => Taro.navigateTo({ url: '/pages/profile/edit-interests' })} />
        {interests ? (
          <>
            <InfoRow label="活动区域" value={interests.activity_area || '-'} />
            <InfoRow label="活动频率" value={interests.activity_frequency || '-'} />
            <InfoRow label="玩本类型" value={interests.game_type_pref || '-'} />
            <InfoRow label="剧本类型" value={interests.scenario_mode_pref?.join(', ') || '-'} />
          </>
        ) : (
          <Text className="hint">尚未填写</Text>
        )}
      </View>

      {/* 更多偏好 */}
      <View className="card">
        <CardHeader title="时间/预算/偏好" onEdit={() => Taro.navigateTo({ url: '/pages/profile/edit-more-interests' })} />
        {interests?.budget_range || interests?.preferred_time_slots?.length ? (
          <>
            {interests.budget_range && <InfoRow label="预算" value={interests.budget_range} />}
            {interests.preferred_time_slots?.length ? <InfoRow label="时段" value={interests.preferred_time_slots.join(', ')} /> : null}
          </>
        ) : (
          <Text className="hint">人数、时段、预算、剧本偏好等</Text>
        )}
      </View>

      {/* 标签 */}
      <View className="card">
        <CardHeader title="个人标签" onEdit={() => Taro.navigateTo({ url: '/pages/profile/edit-tags' })} />
        {identity?.personality_self_tags?.length || identity?.hobby_tags?.length ? (
          <>
            {identity.hobby_tags?.length ? <InfoRow label="兴趣爱好" value={identity.hobby_tags.join(', ')} /> : null}
            {identity.activity_type_tags?.length ? <InfoRow label="活动类型" value={identity.activity_type_tags.join(', ')} /> : null}
            {identity.personality_self_tags?.length ? <InfoRow label="性格标签" value={identity.personality_self_tags.join(', ')} /> : null}
            <InfoRow label="禁忌边界" value={identity?.taboo_tags?.join(', ') || '-'} />
          </>
        ) : (
          <Text className="hint">尚未填写</Text>
        )}
      </View>

      {/* 性格画像 */}
      <View className="card">
        <CardHeader title="性格画像" onEdit={() => Taro.navigateTo({ url: '/pages/profile/edit-personality' })} />
        {personality ? (
          <>
            <ScoreRow label="外向程度" value={personality.extroversion} />
            <ScoreRow label="主动性" value={personality.initiative} />
            <ScoreRow label="情绪稳定" value={personality.emotional_stability} />
          </>
        ) : (
          <Text className="hint">尚未填写</Text>
        )}
      </View>

      {/* Big Five */}
      <View className="card">
        <CardHeader title="性格测试 (Big Five)"
          onEdit={() => Taro.navigateTo({ url: '/pages/quiz/index' })} />
        {quiz && quiz.score_e != null ? (
          <View className="quiz-scores">
            {quiz.personality_type && (
              <View className="type-badge">
                <Text className="type-badge-text">{quiz.personality_type}</Text>
              </View>
            )}
            <ScoreBar label="外向性 E" score={quiz.score_e} />
            <ScoreBar label="宜人性 A" score={quiz.score_a} />
            <ScoreBar label="开放性 O" score={quiz.score_o} />
            <ScoreBar label="尽责性 C" score={quiz.score_c} />
            <ScoreBar label="神经质 N" score={quiz.score_n} />
          </View>
        ) : (
          <View className="quiz-cta" onClick={() => Taro.navigateTo({ url: '/pages/quiz/index' })}>
            <Text className="quiz-cta-text">去测试</Text>
          </View>
        )}
      </View>

      {/* 登出 */}
      <View className="logout-btn" onClick={handleLogout}>
        <Text className="logout-text">退出登录</Text>
      </View>
    </View>
  )
}

// --- 辅助组件 ---

function CardHeader({ title, onEdit }: { title: string; onEdit?: () => void }) {
  return (
    <View className="card-header">
      <Text className="card-title">{title}</Text>
      {onEdit && <Text className="edit-link" onClick={onEdit}>编辑</Text>}
    </View>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="info-row">
      <Text className="info-label">{label}</Text>
      <Text className="info-value">{value}</Text>
    </View>
  )
}

function ScoreRow({ label, value }: { label: string; value: number | null }) {
  return (
    <View className="info-row">
      <Text className="info-label">{label}</Text>
      <View className="score-dots">
        {[1, 2, 3, 4, 5].map(i => (
          <View key={i} className={`dot ${i <= (value || 0) ? 'active' : ''}`} />
        ))}
      </View>
    </View>
  )
}

function ScoreBar({ label, score }: { label: string; score: number | null }) {
  const pct = Math.min(100, Math.max(0, score || 0))
  return (
    <View className="score-bar-row">
      <Text className="score-label">{label}</Text>
      <View className="bar-bg">
        <View className="bar-fill" style={{ width: `${pct}%` }} />
      </View>
      <Text className="score-num">{score || 0}</Text>
    </View>
  )
}

// --- 工具函数 ---

/** Supabase 1:1 关联可能返回数组，取第一个元素 */
function unwrap<T>(data: T[] | T | null | undefined): T | null {
  if (!data) return null
  if (Array.isArray(data)) return data[0] || null
  return data
}
