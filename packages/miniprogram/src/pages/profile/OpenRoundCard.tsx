import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { MiniRoundCardState } from '../../lib/round-state'

export function OpenRoundCard({ card }: { card: MiniRoundCardState | null }) {
  if (!card) return null
  return (
    <View className="card" onClick={card.canOpenSurvey ? () => Taro.navigateTo({ url: '/pages/survey/index' }) : undefined}>
      <Text className="card-title">{card.title}</Text>
      <Text className="round-card-name">{card.roundName}</Text>
      <Text className={`round-card-status ${card.statusTone}`}>{card.statusText}</Text>
      {card.deadlineText ? <Text className="round-card-deadline">{card.deadlineText}</Text> : null}
    </View>
  )
}
