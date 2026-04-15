import { View, Text } from '@tarojs/components'

export function MatchTagGroups({ groups }: { groups: { label: string; tags: string[] }[] }) {
  if (!groups.length) return null
  return (
    <View className="tag-groups">
      {groups.map((group) => (
        <View key={group.label} className="tag-group">
          <Text className="tag-group-label">{group.label}</Text>
          <View className="tag-list">
            {group.tags.map((tag) => (
              <Text key={tag} className="tag-chip">{tag}</Text>
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}
