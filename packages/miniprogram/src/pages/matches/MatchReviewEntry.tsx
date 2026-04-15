import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'

interface Props {
  isGroup: boolean
  reviewed: boolean
  matchId: string
  revieweeId: string | null
}

export function MatchReviewEntry({ isGroup, reviewed, matchId, revieweeId }: Props) {
  if (isGroup) return null
  if (reviewed) {
    return <View className="review-entry reviewed"><Text className="review-entry-text reviewed-text">已评价</Text></View>
  }
  return (
    <View className="review-entry" onClick={() => revieweeId && Taro.navigateTo({ url: `/pages/review/index?matchId=${matchId}&revieweeId=${revieweeId}` })}>
      <Text className="review-entry-text">评价搭档</Text>
    </View>
  )
}
