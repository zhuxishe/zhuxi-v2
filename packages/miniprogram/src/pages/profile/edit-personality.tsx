import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery } from '../../lib/supabase'
import { getMemberId } from '../../lib/member'
import './edit-personality.scss'

const DIMENSIONS = [
  { key: 'extroversion', label: '外向程度', desc: '1=很内向  5=很外向' },
  { key: 'initiative', label: '主动性', desc: '1=被动等待  5=主动出击' },
  { key: 'emotional_stability', label: '情绪稳定', desc: '1=容易波动  5=非常稳定' },
] as const

type Scores = { extroversion: number; initiative: number; emotional_stability: number }

export default function EditPersonality() {
  const [scores, setScores] = useState<Scores>({ extroversion: 0, initiative: 0, emotional_stability: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useDidShow(() => { loadData() })

  const loadData = async () => {
    try {
      const memberId = await getMemberId()
      const rows = await supabaseQuery<any[]>('member_personality', {
        select: 'extroversion,initiative,emotional_stability',
        member_id: `eq.${memberId}`,
      })
      if (rows?.length) {
        const d = rows[0]
        setScores({
          extroversion: d.extroversion || 0,
          initiative: d.initiative || 0,
          emotional_stability: d.emotional_stability || 0,
        })
      }
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const setScore = (key: keyof Scores, val: number) => {
    setScores(prev => ({ ...prev, [key]: val }))
  }

  const handleSave = async () => {
    if (!scores.extroversion || !scores.initiative || !scores.emotional_stability) {
      Taro.showToast({ title: '请完成所有评分', icon: 'none' })
      return
    }
    setSaving(true)
    try {
      const memberId = await getMemberId()
      await supabaseQuery('member_personality', { on_conflict: 'member_id' }, {
        method: 'POST',
        body: { member_id: memberId, ...scores },
      })
      Taro.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 800)
    } catch (err: any) {
      Taro.showToast({ title: err.message || '保存失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <View className="edit-page"><Text className="loading">加载中...</Text></View>
  }

  return (
    <View className="edit-page">
      <View className="form-card">
        <Text className="section-title">性格自评</Text>
        <Text className="section-desc">请根据自我感觉，为以下维度打分（1-5）</Text>

        {DIMENSIONS.map(dim => (
          <View key={dim.key} className="score-section">
            <Text className="score-label">{dim.label}</Text>
            <Text className="score-desc">{dim.desc}</Text>
            <View className="score-select">
              {[1, 2, 3, 4, 5].map(n => (
                <View key={n}
                  className={`score-dot ${scores[dim.key] === n ? 'active' : ''}`}
                  onClick={() => setScore(dim.key, n)}>
                  <Text className="score-dot-text">{n}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>

      <View className="save-btn" onClick={!saving ? handleSave : undefined}>
        <Text className="save-text">{saving ? '保存中...' : '保存'}</Text>
      </View>
    </View>
  )
}
