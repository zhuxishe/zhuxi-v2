import { View, Text, Image } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { DIMENSION_LABELS } from '../../lib/quiz-data'
import { getMiniQuizImage } from '../../lib/quiz-images'
import './result.scss'

const DIMENSIONS = ['E', 'A', 'O', 'C', 'N'] as const

export default function QuizResult() {
  const router = useRouter()
  const { e, a, o, c, n, type } = router.params

  const scores = {
    E: Number(e) || 0,
    A: Number(a) || 0,
    O: Number(o) || 0,
    C: Number(c) || 0,
    N: Number(n) || 0,
  }

  const personalityType = decodeURIComponent(type || '')
  const illustration = getMiniQuizImage(personalityType)

  return (
    <View className="result-page">
      <View className="result-card">
        <Text className="result-title">测试完成</Text>

        {illustration && (
          <Image className="result-illustration" src={illustration} mode="widthFix" />
        )}

        {personalityType && (
          <View className="type-badge">
            <Text className="type-text">{personalityType}</Text>
          </View>
        )}

        <View className="scores">
          {DIMENSIONS.map(dim => (
            <View key={dim} className="score-row">
              <Text className="dim-label">{DIMENSION_LABELS[dim]} {dim}</Text>
              <View className="bar-track">
                <View className="bar-fill" style={{ width: `${Math.min(100, Math.max(0, scores[dim]))}%` }} />
              </View>
              <Text className="score-num">{scores[dim]}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="actions">
        <View className="action-btn primary" onClick={() => Taro.switchTab({ url: '/pages/profile/index' })}>
          <Text className="action-text primary-text">查看档案</Text>
        </View>
        <View className="action-btn secondary" onClick={() => Taro.navigateBack()}>
          <Text className="action-text secondary-text">重新测试</Text>
        </View>
      </View>
    </View>
  )
}
