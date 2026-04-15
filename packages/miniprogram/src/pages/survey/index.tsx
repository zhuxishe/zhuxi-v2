import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery } from '../../lib/supabase'
import { getMemberId } from '../../lib/member'
import { requireAuth } from '../../lib/auth'
import { fetchMiniOpenRound } from '../../lib/open-round'
import { getNext14Days } from './survey-constants'
import { getMiniSurveyRoundError } from './survey-submit'
import { SurveyPreferenceCard } from './SurveyPreferenceCard'
import { SurveyAvailabilityCard } from './SurveyAvailabilityCard'
import { SurveyMessageCard } from './SurveyMessageCard'
import './index.scss'

export default function Survey() {
  const [roundId, setRoundId] = useState('')
  const [roundName, setRoundName] = useState('')
  const [noRound, setNoRound] = useState(false)
  const [hasExistingSubmission, setHasExistingSubmission] = useState(false)
  const [gameType, setGameType] = useState('')
  const [genderPref, setGenderPref] = useState('')
  const [availability, setAvailability] = useState<Record<string, string[]>>({})
  const [interestTags, setInterestTags] = useState<string[]>([])
  const [socialStyle, setSocialStyle] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const days = getNext14Days()

  useDidShow(() => { if (requireAuth()) loadData() })

  function resetForm() {
    setRoundId('')
    setRoundName('')
    setGameType('')
    setGenderPref('')
    setAvailability({})
    setInterestTags([])
    setSocialStyle('')
    setMessage('')
  }

  async function loadData() {
    setLoading(true)
    try {
      setNoRound(false)
      setHasExistingSubmission(false)
      resetForm()
      const round = await fetchMiniOpenRound()
      if (!round) {
        setNoRound(true)
        return
      }
      setRoundId(round.id)
      setRoundName(round.round_name || '当前轮次')
      const memberId = await getMemberId()
      const submissions = await supabaseQuery<any[]>('match_round_submissions', { select: '*', round_id: `eq.${round.id}`, member_id: `eq.${memberId}` })
      if (submissions?.length) {
        setHasExistingSubmission(true)
        hydrateForm(submissions[0])
      }
    } catch (err) {
      console.error('加载问卷失败:', err)
      resetForm()
      setNoRound(true) // 加载失败时显示错误态，阻止提交
    } finally {
      setLoading(false)
    }
  }

  function hydrateForm(submission: any) {
    setGameType(submission.game_type_pref || '')
    setGenderPref(submission.gender_pref || '')
    setAvailability(submission.availability || {})
    setInterestTags(submission.interest_tags || [])
    setSocialStyle(submission.social_style || '')
    setMessage(submission.message || '')
  }

  function toggleSlot(date: string, slot: string) {
    setAvailability((prev) => {
      const slots = prev[date] || []
      const next = slots.includes(slot) ? slots.filter((item) => item !== slot) : [...slots, slot]
      return { ...prev, [date]: next }
    })
  }
  function toggleInterest(tag: string) {
    setInterestTags((prev) => prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag])
  }

  async function handleSubmit() {
    if (!gameType) return Taro.showToast({ title: '请选择玩本类型', icon: 'none' })
    if (!genderPref) return Taro.showToast({ title: '请选择性别偏好', icon: 'none' })
    if (!Object.values(availability).some((slots) => slots.length > 0)) return Taro.showToast({ title: '请至少选择一个可用时段', icon: 'none' })
    setSubmitting(true)
    try {
      const round = await supabaseQuery<{ id: string; status: string | null; survey_end: string | null }>('match_rounds', {
        select: 'id,status,survey_end',
        id: `eq.${roundId}`,
      }, { single: true })
      const roundError = getMiniSurveyRoundError(round)
      if (roundError) throw new Error(roundError)

      const memberId = await getMemberId()
      await supabaseQuery('match_round_submissions', { on_conflict: 'round_id,member_id' }, {
        method: 'POST',
        body: { round_id: roundId, member_id: memberId, game_type_pref: gameType, gender_pref: genderPref, availability, interest_tags: interestTags, social_style: socialStyle || null, message: message.trim() || null },
      })
      Taro.showToast({ title: '提交成功', icon: 'success' })
      setTimeout(() => Taro.redirectTo({ url: '/pages/survey/success' }), 800)
    } catch (err: any) {
      Taro.showToast({ title: err.message || '提交失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <View className="survey-page"><Text className="loading">加载中...</Text></View>
  if (noRound) return <View className="survey-page"><View className="empty-card"><Text className="empty-text">当前没有开放的匹配轮次</Text><Text className="empty-hint">管理员开启新一轮匹配后，你可以在这里填写偏好</Text></View></View>

  return (
    <View className="survey-page">
      <Text className="round-name">{roundName}</Text>
      <SurveyPreferenceCard
        gameType={gameType}
        genderPref={genderPref}
        socialStyle={socialStyle}
        interestTags={interestTags}
        onGameType={setGameType}
        onGenderPref={setGenderPref}
        onSocialStyle={setSocialStyle}
        onToggleInterest={toggleInterest}
      />
      <SurveyAvailabilityCard days={days} availability={availability} onToggleSlot={toggleSlot} />
      <SurveyMessageCard message={message} onInput={setMessage} />
      <View className="submit-btn" onClick={!submitting ? handleSubmit : undefined}>
        <Text className="submit-text">{submitting ? '提交中...' : hasExistingSubmission ? '更新问卷' : '提交问卷'}</Text>
      </View>
    </View>
  )
}
