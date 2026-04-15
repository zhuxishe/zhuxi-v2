import { View, Text } from '@tarojs/components'
import { MiniActivityItem } from './profile-activities'
import './RecentActivitiesCard.scss'

export function RecentActivitiesCard({ activities }: { activities: MiniActivityItem[] }) {
  return (
    <View className="card">
      <Text className="card-title">最近活动</Text>
      {activities.length === 0 ? (
        <Text className="recent-activities-empty">还没有活动记录</Text>
      ) : (
        <View className="recent-activities-list">
          {activities.map((activity) => (
            <View key={activity.id} className="recent-activity-item">
              <View className="recent-activity-main">
                <Text className="recent-activity-title">{activity.title}</Text>
                <Text className="recent-activity-location">{activity.location}</Text>
              </View>
              <Text className="recent-activity-date">{activity.activityDate}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
