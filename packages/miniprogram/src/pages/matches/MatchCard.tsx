import { View, Text } from '@tarojs/components'
import type { ITouchEvent } from '@tarojs/components/types/common'
import Taro from '@tarojs/taro'
import type { MiniMatchListItem } from './match-list'

interface MatchCardProps {
  item: MiniMatchListItem
}

export default function MatchCard({ item }: MatchCardProps) {
  const openReview = (event: ITouchEvent) => {
    event.stopPropagation()
    if (!item.revieweeId) return
    Taro.navigateTo({ url: `/pages/review/index?matchId=${item.match.id}&revieweeId=${item.revieweeId}` })
  }

  return (
    <View className="match-card" onClick={() => Taro.navigateTo({ url: `/pages/matches/detail?id=${item.match.id}` })}>
      <View className="match-header">
        <Text className="partner-name">{item.partnerName}</Text>
        {item.match.best_slot && <Text className="slot-tag">{item.match.best_slot}</Text>}
      </View>
      {item.groupMemberNames.length > 0 && (
        <Text className="group-members">{item.groupMemberNames.join(' / ')}</Text>
      )}
      <View className="match-meta">
        <Text className="match-date">{new Date(item.match.created_at).toLocaleDateString('zh-CN')}</Text>
        {item.match.rank != null && <Text className="match-rank">排名 #{item.match.rank}</Text>}
      </View>
      {item.revieweeId ? (
        item.reviewed ? (
          <View className="review-btn reviewed">
            <Text className="review-btn-text reviewed-text">已评价</Text>
          </View>
        ) : (
          <View className="review-btn" onClick={openReview}>
            <Text className="review-btn-text">评价</Text>
          </View>
        )
      ) : null}
    </View>
  )
}

