import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { requireAuth } from '../../lib/auth'
import { getMemberId } from '../../lib/member'
import { supabaseQuery } from '../../lib/supabase'
import { QUIZ_QUESTIONS, calculateScores, generatePersonalityType } from '../../lib/quiz-data'
import './index.scss'

export default function Quiz() {
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<{ questionId: number; score: number }[]>([])
  const [submitting, setSubmitting] = useState(false)

  // 每次进入页面时重置状态（支持"重新测试"）
  useDidShow(() => {
    setCurrent(0)
    setAnswers([])
  })

  const total = QUIZ_QUESTIONS.length
  const question = QUIZ_QUESTIONS[current]

  const handleSelect = (score: number) => {
    const next = [...answers.filter(a => a.questionId !== question.id), { questionId: question.id, score }]
    setAnswers(next)

    if (current < total - 1) {
      setTimeout(() => setCurrent(current + 1), 300)
    }
  }

  const handlePrev = () => {
    if (current > 0) setCurrent(current - 1)
  }

  const selectedScore = answers.find(a => a.questionId === question.id)?.score

  const handleSubmit = async () => {
    if (!requireAuth()) return
    if (answers.length < total) {
      Taro.showToast({ title: '请完成所有题目', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      const memberId = await getMemberId()
      const scores = calculateScores(answers)
      const personalityType = generatePersonalityType(scores)

      await supabaseQuery('personality_quiz_results', { on_conflict: 'member_id' }, {
        method: 'POST',
        body: {
          member_id: memberId,
          answers,
          score_e: scores.E,
          score_a: scores.A,
          score_o: scores.O,
          score_c: scores.C,
          score_n: scores.N,
          personality_type: personalityType,
          completed_at: new Date().toISOString(),
        },
      })

      Taro.redirectTo({
        url: `/pages/quiz/result?e=${scores.E}&a=${scores.A}&o=${scores.O}&c=${scores.C}&n=${scores.N}&type=${encodeURIComponent(personalityType)}`,
      })
    } catch (err: any) {
      Taro.showToast({ title: err.message || '提交失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className="quiz-page">
      {/* 进度 */}
      <View className="progress-section">
        <View className="progress-bar">
          <View className="progress-fill" style={{ width: `${((current + 1) / total) * 100}%` }} />
        </View>
        <Text className="progress-text">{current + 1} / {total}</Text>
      </View>

      {/* 题目 */}
      <View className="question-card">
        <Text className="question-text">{question.text}</Text>

        <View className="options">
          {question.options.map((opt, i) => (
            <View key={i}
              className={`option ${selectedScore === opt.score ? 'selected' : ''}`}
              onClick={() => handleSelect(opt.score)}>
              <Text className="option-text">{opt.text}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 底部导航 */}
      <View className="nav-row">
        {current > 0 && (
          <View className="nav-btn secondary" onClick={handlePrev}>
            <Text className="nav-btn-text secondary-text">上一题</Text>
          </View>
        )}
        {current === total - 1 && answers.length === total && (
          <View className="nav-btn primary" onClick={!submitting ? handleSubmit : undefined}>
            <Text className="nav-btn-text primary-text">{submitting ? '提交中...' : '查看结果'}</Text>
          </View>
        )}
      </View>
    </View>
  )
}
