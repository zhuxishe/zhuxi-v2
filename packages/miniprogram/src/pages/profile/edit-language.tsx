import { View, Text, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery } from '../../lib/supabase'
import { getMemberId } from '../../lib/member'
import './edit-language.scss'

const LANGUAGES = ['中文', '日语', '英语']
const JP_LEVELS = ['N1', 'N2', 'N3', 'N4', 'N5', '无证书但能日常交流', '不会日语']

export default function EditLanguage() {
  const [selectedLangs, setSelectedLangs] = useState<string[]>([])
  const [jpLevel, setJpLevel] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useDidShow(() => { loadData() })

  const loadData = async () => {
    try {
      const memberId = await getMemberId()
      const rows = await supabaseQuery<any[]>('member_language', {
        select: 'communication_language_pref,japanese_level',
        member_id: `eq.${memberId}`,
      })
      if (rows?.length) {
        setSelectedLangs(rows[0].communication_language_pref || [])
        setJpLevel(rows[0].japanese_level || '')
      }
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleLang = (lang: string) => {
    setSelectedLangs(prev =>
      prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const memberId = await getMemberId()

      await supabaseQuery('member_language', {
        on_conflict: 'member_id',
      }, {
        method: 'POST',
        body: {
          member_id: memberId,
          communication_language_pref: selectedLangs,
          japanese_level: jpLevel || null,
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
        <Text className="section-title">交流语言（可多选）</Text>
        <View className="tag-grid">
          {LANGUAGES.map(lang => (
            <View key={lang}
              className={`tag ${selectedLangs.includes(lang) ? 'active' : ''}`}
              onClick={() => toggleLang(lang)}>
              <Text className="tag-text">{lang}</Text>
            </View>
          ))}
        </View>

        <Text className="section-title">日语水平</Text>
        <Picker mode="selector" range={JP_LEVELS}
          value={JP_LEVELS.indexOf(jpLevel)}
          onChange={e => setJpLevel(JP_LEVELS[e.detail.value as number])}>
          <View className="form-row">
            <Text className="form-label">等级</Text>
            <Text className={`form-picker ${jpLevel ? '' : 'placeholder'}`}>
              {jpLevel || '请选择'}
            </Text>
          </View>
        </Picker>
      </View>

      <View className="save-btn" onClick={!saving ? handleSave : undefined}>
        <Text className="save-text">{saving ? '保存中...' : '保存'}</Text>
      </View>
    </View>
  )
}
