import { View, Text, Textarea } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery } from '../../lib/supabase'
import { getMemberId } from '../../lib/member'
import { requireAuth } from '../../lib/auth'
import './index.scss'

const GAME_TYPES = ['双人', '多人', '都可以']
const GENDER_PREFS = ['男', '女', '都可以']
const INTEREST_TAGS = ['推理本', '情感本', '恐怖本', '欢乐本', '机制本', '阵营本', '沉浸本']
const SOCIAL_STYLES = ['慢热', '活跃', '善于倾听', '话题广', '温和', '喜欢竞技']
const TIME_SLOTS = ['上午', '下午', '晚上']

function getNext14Days(): string[] {
  const days: string[] = []
  const now = new Date()
  for (let i = 0; i < 14; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return `${d.getMonth() + 1}/${d.getDate()} (${weekdays[d.getDay()]})`
}

export default function Survey() {
  const [roundId, setRoundId] = useState('')
  const [roundName, setRoundName] = useState('')
  const [noRound, setNoRound] = useState(false)
  const [gameType, setGameType] = useState('')
  const [genderPref, setGenderPref] = useState('')
  const [availability, setAvailability] = useState<Record<string, string[]>>({})
  const [interestTags, setInterestTags] = useState<string[]>([])
  const [socialStyle, setSocialStyle] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const days = getNext14Days()

  useDidShow(() => {
    if (!requireAuth()) return
    loadData()
  })

  const loadData = async () => {
    setLoading(true)
    try {
      // 查开放轮次
      const rounds = await supabaseQuery<any[]>('match_rounds', {
        select: 'id,name,survey_end', status: 'eq.open', limit: '1',
      })
      if (!rounds?.length) { setNoRound(true); setLoading(false); return }

      const round = rounds[0]
      setRoundId(round.id)
      setRoundName(round.name || '当前轮次')

      // 查已有提交
      const memberId = await getMemberId()
      const subs = await supabaseQuery<any[]>('match_round_submissions', {
        select: '*', round_id: `eq.${round.id}`, member_id: `eq.${memberId}`,
      })
      if (subs?.length) {
        const s = subs[0]
        setGameType(s.game_type_pref || '')
        setGenderPref(s.gender_pref || '')
        setAvailability(s.availability || {})
        setInterestTags(s.interest_tags || [])
        setSocialStyle(s.social_style || '')
        setMessage(s.message || '')
      }
    } catch (err) {
      console.error('加载问卷失败:', err)
    } finally { setLoading(false) }
  }

  const toggleSlot = (date: string, slot: string) => {
    setAvailability(prev => {
      const slots = prev[date] || []
      const next = slots.includes(slot) ? slots.filter(s => s !== slot) : [...slots, slot]
      return { ...prev, [date]: next }
    })
  }

  const toggleInterest = (tag: string) => {
    setInterestTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  const hasAnySlot = Object.values(availability).some(s => s.length > 0)

  const handleSubmit = async () => {
    if (!gameType) { Taro.showToast({ title: '请选择玩本类型', icon: 'none' }); return }
    if (!genderPref) { Taro.showToast({ title: '请选择性别偏好', icon: 'none' }); return }
    if (!hasAnySlot) { Taro.showToast({ title: '请至少选择一个可用时段', icon: 'none' }); return }

    setSubmitting(true)
    try {
      const memberId = await getMemberId()
      await supabaseQuery('match_round_submissions', { on_conflict: 'round_id,member_id' }, {
        method: 'POST',
        body: {
          round_id: roundId, member_id: memberId,
          game_type_pref: gameType, gender_pref: genderPref,
          availability, interest_tags: interestTags,
          social_style: socialStyle || null, message: message.trim() || null,
        },
      })
      Taro.showToast({ title: '提交成功', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 800)
    } catch (err: any) {
      Taro.showToast({ title: err.message || '提交失败', icon: 'none' })
    } finally { setSubmitting(false) }
  }

  if (loading) return <View className="survey-page"><Text className="loading">加载中...</Text></View>
  if (noRound) return (
    <View className="survey-page">
      <View className="empty-card">
        <Text className="empty-text">当前没有开放的匹配轮次</Text>
        <Text className="empty-hint">管理员开启新一轮匹配后，你可以在这里填写偏好</Text>
      </View>
    </View>
  )

  return (
    <View className="survey-page">
      <Text className="round-name">{roundName}</Text>

      <View className="form-card">
        <Text className="section-title">玩本类型 *</Text>
        <View className="tag-grid">
          {GAME_TYPES.map(t => (
            <View key={t} className={`tag ${gameType === t ? 'active' : ''}`} onClick={() => setGameType(t)}>
              <Text className="tag-text">{t}</Text>
            </View>
          ))}
        </View>

        <Text className="section-title">搭档性别偏好 *</Text>
        <View className="tag-grid">
          {GENDER_PREFS.map(t => (
            <View key={t} className={`tag ${genderPref === t ? 'active' : ''}`} onClick={() => setGenderPref(t)}>
              <Text className="tag-text">{t}</Text>
            </View>
          ))}
        </View>

        <Text className="section-title">社交风格</Text>
        <View className="tag-grid">
          {SOCIAL_STYLES.map(t => (
            <View key={t} className={`tag ${socialStyle === t ? 'active' : ''}`} onClick={() => setSocialStyle(socialStyle === t ? '' : t)}>
              <Text className="tag-text">{t}</Text>
            </View>
          ))}
        </View>

        <Text className="section-title">感兴趣的剧本类型</Text>
        <View className="tag-grid">
          {INTEREST_TAGS.map(t => (
            <View key={t} className={`tag ${interestTags.includes(t) ? 'active' : ''}`} onClick={() => toggleInterest(t)}>
              <Text className="tag-text">{t}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="form-card">
        <Text className="section-title">可用时间 *（未来14天）</Text>
        <View className="time-grid">
          <View className="time-header">
            <Text className="time-corner"></Text>
            {TIME_SLOTS.map(s => <Text key={s} className="time-slot-label">{s}</Text>)}
          </View>
          {days.map(date => (
            <View key={date} className="time-row">
              <Text className="time-date">{formatDate(date)}</Text>
              {TIME_SLOTS.map(slot => (
                <View key={slot}
                  className={`time-cell ${(availability[date] || []).includes(slot) ? 'active' : ''}`}
                  onClick={() => toggleSlot(date, slot)} />
              ))}
            </View>
          ))}
        </View>
      </View>

      <View className="form-card">
        <Text className="section-title">想说的话（可选）</Text>
        <Textarea className="message-input" value={message} placeholder="对搭档的期望、特殊情况说明等..."
          maxlength={200} onInput={e => setMessage(e.detail.value)} />
      </View>

      <View className="submit-btn" onClick={!submitting ? handleSubmit : undefined}>
        <Text className="submit-text">{submitting ? '提交中...' : '提交问卷'}</Text>
      </View>
    </View>
  )
}
