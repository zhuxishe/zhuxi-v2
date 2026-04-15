import { View, Text } from '@tarojs/components'

interface Props {
  activityCount: number
  reviewCount: number
  avgReviewScore: number | null
}

export function ProfileStatsCard({ activityCount, reviewCount, avgReviewScore }: Props) {
  return (
    <View className="card">
      <Text className="card-title">资料总览</Text>
      <View className="stats-grid">
        <StatItem label="参加活动" value={String(activityCount)} />
        <StatItem label="收到评价" value={String(reviewCount)} />
        <StatItem label="平均评分" value={avgReviewScore != null ? avgReviewScore.toFixed(1) : '-'} />
      </View>
    </View>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <View className="stat-card">
      <Text className="stat-value">{value}</Text>
      <Text className="stat-label">{label}</Text>
    </View>
  )
}
