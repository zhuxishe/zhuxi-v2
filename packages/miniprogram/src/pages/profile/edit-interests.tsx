import { View, Text, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery } from '../../lib/supabase'
import { getMemberId } from '../../lib/member'
import './edit-interests.scss'

const AREAS = ['新宿/渋谷', '池袋', '上野/秋葉原', '品川/目黒', '六本木/赤坂', '横浜', '千葉', 'さいたま', '其他']
const FREQUENCIES = ['每周1次以上', '每周1次', '每两周1次', '每月1次', '不固定']
const GAME_TYPE_PREFS = ['双人本优先', '多人本优先', '都可以', '看活动而定']
const SCENARIO_MODES = ['推理本', '情感本', '恐怖本', '欢乐本', '机制本', '阵营本', '沉浸本']
const THEMES = ['情感', '推理', '机制', '恐怖', '欢乐', '沉浸', '硬核', '新手友好']

export default function EditInterests() {
  const [area, setArea] = useState('')
  const [frequency, setFrequency] = useState('')
  const [gameType, setGameType] = useState('')
  const [modes, setModes] = useState<string[]>([])
  const [themes, setThemes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useDidShow(() => { loadData() })

  const loadData = async () => {
    try {
      const memberId = await getMemberId()
      const rows = await supabaseQuery<any[]>('member_interests', {
        select: 'activity_area,activity_frequency,game_type_pref,scenario_mode_pref,scenario_theme_tags',
        member_id: `eq.${memberId}`,
      })
      if (rows?.length) {
        const d = rows[0]
        setArea(d.activity_area || '')
        setFrequency(d.activity_frequency || '')
        setGameType(d.game_type_pref || '')
        setModes(d.scenario_mode_pref || [])
        setThemes(d.scenario_theme_tags || [])
      }
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleItem = (list: string[], setList: (v: string[]) => void, item: string) => {
    setList(list.includes(item) ? list.filter(i => i !== item) : [...list, item])
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const memberId = await getMemberId()

      await supabaseQuery('member_interests', {
        on_conflict: 'member_id',
      }, {
        method: 'POST',
        body: {
          member_id: memberId,
          activity_area: area || null,
          activity_frequency: frequency || null,
          game_type_pref: gameType || null,
          scenario_mode_pref: modes,
          scenario_theme_tags: themes,
        },
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
        <Picker mode="selector" range={AREAS}
          value={AREAS.indexOf(area)}
          onChange={e => setArea(AREAS[e.detail.value as number])}>
          <View className="form-row">
            <Text className="form-label">活动区域</Text>
            <Text className={`form-picker ${area ? '' : 'placeholder'}`}>
              {area || '请选择'}
            </Text>
          </View>
        </Picker>

        <Picker mode="selector" range={FREQUENCIES}
          value={FREQUENCIES.indexOf(frequency)}
          onChange={e => setFrequency(FREQUENCIES[e.detail.value as number])}>
          <View className="form-row">
            <Text className="form-label">活动频率</Text>
            <Text className={`form-picker ${frequency ? '' : 'placeholder'}`}>
              {frequency || '请选择'}
            </Text>
          </View>
        </Picker>

        <Picker mode="selector" range={GAME_TYPE_PREFS}
          value={GAME_TYPE_PREFS.indexOf(gameType)}
          onChange={e => setGameType(GAME_TYPE_PREFS[e.detail.value as number])}>
          <View className="form-row">
            <Text className="form-label">玩本类型</Text>
            <Text className={`form-picker ${gameType ? '' : 'placeholder'}`}>
              {gameType || '请选择'}
            </Text>
          </View>
        </Picker>

        <Text className="section-title">剧本类型偏好（可多选）</Text>
        <View className="tag-grid">
          {SCENARIO_MODES.map(m => (
            <View key={m} className={`tag ${modes.includes(m) ? 'active' : ''}`}
              onClick={() => toggleItem(modes, setModes, m)}>
              <Text className="tag-text">{m}</Text>
            </View>
          ))}
        </View>

        <Text className="section-title">剧本题材标签（可多选）</Text>
        <View className="tag-grid">
          {THEMES.map(t => (
            <View key={t} className={`tag ${themes.includes(t) ? 'active' : ''}`}
              onClick={() => toggleItem(themes, setThemes, t)}>
              <Text className="tag-text">{t}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="save-btn" onClick={!saving ? handleSave : undefined}>
        <Text className="save-text">{saving ? '保存中...' : '保存'}</Text>
      </View>
    </View>
  )
}
