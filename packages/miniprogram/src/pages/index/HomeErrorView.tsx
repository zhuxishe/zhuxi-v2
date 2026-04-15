import { View, Text, Button } from '@tarojs/components'

interface Props {
  message: string
  onRetry: () => void
}

export function HomeErrorView({ message, onRetry }: Props) {
  return (
    <View className="state-card">
      <Text className="state-icon rejected">!</Text>
      <Text className="state-title">首页加载失败</Text>
      <Text className="state-desc">{message}</Text>
      <Button className="state-btn" onClick={onRetry}>重试</Button>
    </View>
  )
}
