import { View, Text, Textarea, Slider } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery } from '../../lib/supabase'
import { getMemberId } from '../../lib/member'
import './index.scss'

const POSITIVE_TAGS = ['准时', '有趣', '配合度高', '逻辑强', '气氛活跃', '善于倾听', '思路清晰', '很有演技', '新手友好', '温暖']
const NEGATIVE_TAGS = ['迟到', '不专注', '打断他人', '消极态度', '过于沉默']

const SCORE_LABELS = [
  { key: 'overall_score', label: '总体印象' },
  { key: 'punctuality_score', label: '准时性' },
  { key: 'communication_score', label: '沟通' },
  { key: 'teamwork_score', label: '配合度' },
  { key: 'fun_score', label: '趣味性' },
]

type Scores = Record<string, number>

export default function Review() {
  const router = useRouter()
  const { matchId, revieweeId } = router.params

  const [scores, setScores] = useState<Scores>({
    overall_score: 3, punctuality_score: 3, communication_score: 3,
    teamwork_score: 3, fun_score: 3,
  })
  const [wouldPlayAgain, setWouldPlayAgain] = useState(true)
  const [posTags, setPosTags] = useState<string[]>([])
  const [negTags, setNegTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const toggleTag = (list: string[], set: (v: string[]) => void, tag: string) => {
    set(list.includes(tag) ? list.filter(t => t !== tag) : [...list, tag])
  }

  const handleSubmit = async () => {
    if (!matchId || !revieweeId) {
      Taro.showToast({ title: '参数错误', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      const memberId = await getMemberId()

      // 检查是否已评价
      const existing = await supabaseQuery<any[]>('mutual_reviews', {
        select: 'id',
        match_result_id: `eq.${matchId}`,
        reviewer_id: `eq.${memberId}`,
      })
      if (existing?.length) {
        Taro.showToast({ title: '你已经评价过了', icon: 'none' })
        setSubmitting(false)
        return
      }

      await supabaseQuery('mutual_reviews', {}, {
        method: 'POST',
        body: {
          match_result_id: matchId,
          reviewer_id: memberId,
          reviewee_id: revieweeId,
          ...scores,
          would_play_again: wouldPlayAgain,
          positive_tags: posTags,
          negative_tags: negTags,
          comment: comment.trim() || null,
        },
      })

      Taro.showToast({ title: '评价提交成功', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 800)
    } catch (err: any) {
      Taro.showToast({ title: err.message || '提交失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className="review-page">
      <View className="form-card">
        <Text className="section-title">评分</Text>
        {SCORE_LABELS.map(({ key, label }) => (
          <View key={key} className="slider-row">
            <Text className="slider-label">{label}</Text>
            <Slider className="slider" min={1} max={5} step={1}
              value={scores[key]} activeColor="#3C6E47" blockColor="#3C6E47"
              onChange={e => setScores(prev => ({ ...prev, [key]: e.detail.value }))} />
            <Text className="slider-value">{scores[key]}</Text>
          </View>
        ))}

        <View className="toggle-row">
          <Text className="toggle-label">还想一起玩吗？</Text>
          <View className="toggle-group">
            <View className={`toggle-btn ${wouldPlayAgain ? 'active' : ''}`}
              onClick={() => setWouldPlayAgain(true)}>
              <Text className="toggle-text">想</Text>
            </View>
            <View className={`toggle-btn ${!wouldPlayAgain ? 'active neg' : ''}`}
              onClick={() => setWouldPlayAgain(false)}>
              <Text className="toggle-text">不想</Text>
            </View>
          </View>
        </View>
      </View>

      <View className="form-card">
        <Text className="section-title">正面标签</Text>
        <View className="tag-grid">
          {POSITIVE_TAGS.map(t => (
            <View key={t} className={`tag ${posTags.includes(t) ? 'active' : ''}`}
              onClick={() => toggleTag(posTags, setPosTags, t)}>
              <Text className="tag-text">{t}</Text>
            </View>
          ))}
        </View>

        <Text className="section-title">改进标签</Text>
        <View className="tag-grid">
          {NEGATIVE_TAGS.map(t => (
            <View key={t} className={`tag ${negTags.includes(t) ? 'active neg' : ''}`}
              onClick={() => toggleTag(negTags, setNegTags, t)}>
              <Text className="tag-text">{t}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="form-card">
        <Text className="section-title">补充评价（可选）</Text>
        <Textarea className="comment-input" value={comment}
          placeholder="说点什么..." maxlength={500}
          onInput={e => setComment(e.detail.value)} />
      </View>

      <View className="submit-btn" onClick={!submitting ? handleSubmit : undefined}>
        <Text className="submit-text">{submitting ? '提交中...' : '提交评价'}</Text>
      </View>
    </View>
  )
}
