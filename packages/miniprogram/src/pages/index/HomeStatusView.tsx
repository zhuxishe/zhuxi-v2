import { View, Text, Button } from '@tarojs/components'

interface Props {
  rejected?: boolean
  onEdit?: () => void
}

export function HomeStatusView({ rejected, onEdit }: Props) {
  return (
    <View className="state-card">
      <Text className={`state-icon ${rejected ? 'rejected' : 'pending'}`}>
        {rejected ? '✕' : '⌛'}
      </Text>
      <Text className="state-title">
        {rejected ? '审核未通过' : '资料审核中'}
      </Text>
      <Text className="state-desc">
        {rejected
          ? '当前资料暂未通过审核，请等待后续通知。'
          : '你的基本资料已经提交成功，我们会尽快完成审核。'}
      </Text>
      {!rejected && (
        <Button className="state-btn" onClick={onEdit}>
          修改资料
        </Button>
      )}
    </View>
  )
}
