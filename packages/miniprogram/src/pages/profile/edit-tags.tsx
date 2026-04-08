import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery } from '../../lib/supabase'
import { getMemberId } from '../../lib/member'
import './edit-tags.scss'

const PERSONALITY_TAGS = ['外向', '内向', '社牛', '社恐', '慢热', '幽默', '认真', '温和', '直率', '活泼']

const HOBBY_TAGS = [
  '剧本杀', '桌游', '咖啡探店', '美食', '旅行', '运动', '音乐', '电影',
  '动漫', '游戏', '读书', '摄影', '烹饪', '手工', '绘画', '舞蹈',
  '编程', '语言学习', '宠物', '户外活动', '瑜伽/冥想', '购物', '志愿活动', '其他',
]

const ACTIVITY_TYPE_TAGS = [
  '剧本杀', '桌游', '聚餐', '咖啡', '城市散步', '看展', '观影',
  'K歌', '运动', '旅行', 'TRPG', '密室逃脱', '志愿活动', '其他',
]

const TABOO_TAGS = [
  '迟到爽约', '临时变卦', '强行劝酒', '室内吸烟',
  '过度肢体接触', '过度打探隐私', '偷拍',
  '恋爱导向过强', '借钱/推销', '酒后失控',
  '脏话攻击', '情绪输出过强',
  '私人空间局', '单独异性局', '临时加人', '过远通勤',
  '不接受恐怖内容', '不接受高压竞争',
  '无明显禁忌', '其他',
]

export default function EditTags() {
  const [personalityTags, setPersonalityTags] = useState<string[]>([])
  const [hobbyTags, setHobbyTags] = useState<string[]>([])
  const [activityTypeTags, setActivityTypeTags] = useState<string[]>([])
  const [tabooTags, setTabooTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useDidShow(() => { loadData() })

  const loadData = async () => {
    try {
      const memberId = await getMemberId()
      const rows = await supabaseQuery<any[]>('member_identity', {
        select: 'personality_self_tags,hobby_tags,activity_type_tags,taboo_tags',
        member_id: `eq.${memberId}`,
      })
      if (rows?.length) {
        const d = rows[0]
        setPersonalityTags(d.personality_self_tags || [])
        setHobbyTags(d.hobby_tags || [])
        setActivityTypeTags(d.activity_type_tags || [])
        setTabooTags(d.taboo_tags || [])
      }
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggle = (list: string[], setList: (v: string[]) => void, item: string) => {
    setList(list.includes(item) ? list.filter(i => i !== item) : [...list, item])
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const memberId = await getMemberId()
      await supabaseQuery('member_identity', {
        member_id: `eq.${memberId}`,
      }, {
        method: 'PATCH',
        body: {
          personality_self_tags: personalityTags,
          hobby_tags: hobbyTags,
          activity_type_tags: activityTypeTags,
          taboo_tags: tabooTags,
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
        <Text className="section-title">性格自评标签（可多选）</Text>
        <View className="tag-grid">
          {PERSONALITY_TAGS.map(t => (
            <View key={t} className={`tag ${personalityTags.includes(t) ? 'active' : ''}`}
              onClick={() => toggle(personalityTags, setPersonalityTags, t)}>
              <Text className="tag-text">{t}</Text>
            </View>
          ))}
        </View>

        <Text className="section-title">兴趣爱好（可多选）</Text>
        <View className="tag-grid">
          {HOBBY_TAGS.map(t => (
            <View key={t} className={`tag ${hobbyTags.includes(t) ? 'active' : ''}`}
              onClick={() => toggle(hobbyTags, setHobbyTags, t)}>
              <Text className="tag-text">{t}</Text>
            </View>
          ))}
        </View>

        <Text className="section-title">想参加的活动类型（可多选）</Text>
        <View className="tag-grid">
          {ACTIVITY_TYPE_TAGS.map(t => (
            <View key={t} className={`tag ${activityTypeTags.includes(t) ? 'active' : ''}`}
              onClick={() => toggle(activityTypeTags, setActivityTypeTags, t)}>
              <Text className="tag-text">{t}</Text>
            </View>
          ))}
        </View>

        <Text className="section-title">禁忌/边界（可多选）</Text>
        <Text className="section-hint">选择你不喜欢的行为或场景</Text>
        <View className="tag-grid">
          {TABOO_TAGS.map(t => (
            <View key={t} className={`tag ${tabooTags.includes(t) ? 'active' : ''}`}
              onClick={() => toggle(tabooTags, setTabooTags, t)}>
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
