import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery } from '../../lib/supabase'
import { getMemberId } from '../../lib/member'
import { buildMiniPersonalityForm, EMPTY_MINI_PERSONALITY } from '../../lib/personality-form'
import { MINI_PERSONALITY_DIMENSIONS, MiniPersonalityFormData } from '../../lib/personality'
import { PersonalityField } from './PersonalityField'
import './edit-personality.scss'

export default function EditPersonality() {
  const [form, setForm] = useState<MiniPersonalityFormData>(EMPTY_MINI_PERSONALITY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useDidShow(() => { loadData() })

  const loadData = async () => {
    try {
      const memberId = await getMemberId()
      const rows = await supabaseQuery<any[]>('member_personality', {
        select: 'extroversion,initiative,expression_style_tags,group_role_tags,warmup_speed,planning_style,coop_compete_tendency,emotional_stability,boundary_strength,reply_speed',
        member_id: `eq.${memberId}`,
      })
      setForm(buildMiniPersonalityForm(rows?.[0]))
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const setField = <K extends keyof MiniPersonalityFormData>(key: K, value: MiniPersonalityFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const toggleMulti = (key: 'expression_style_tags' | 'group_role_tags', option: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].includes(option)
        ? prev[key].filter((item) => item !== option)
        : [...prev[key], option],
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const memberId = await getMemberId()
      await supabaseQuery('member_personality', { on_conflict: 'member_id' }, {
        method: 'POST',
        body: { member_id: memberId, ...form },
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
        <Text className="section-desc">可先保存当前填写内容，后续再补全 10 个维度</Text>
        {MINI_PERSONALITY_DIMENSIONS.map((dimension) => (
          <PersonalityField
            key={dimension.key}
            dimension={dimension}
            value={form[dimension.key]}
            onSliderChange={(value) => setField(dimension.key as 'extroversion' | 'initiative' | 'emotional_stability', value)}
            onSingleChange={(value) => setField(dimension.key as 'warmup_speed' | 'planning_style' | 'coop_compete_tendency' | 'boundary_strength' | 'reply_speed', value)}
            onMultiToggle={(value) => toggleMulti(dimension.key as 'expression_style_tags' | 'group_role_tags', value)}
          />
        ))}
      </View>

      <View className="save-btn" onClick={!saving ? handleSave : undefined}>
        <Text className="save-text">{saving ? '保存中...' : '保存'}</Text>
      </View>
    </View>
  )
}
