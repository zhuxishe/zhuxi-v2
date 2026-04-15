import { View, Text, Textarea } from '@tarojs/components'

export function SurveyMessageCard({ message, onInput }: { message: string; onInput: (value: string) => void }) {
  return (
    <View className="form-card">
      <Text className="section-title">想说的话（可选）</Text>
      <Textarea className="message-input" value={message} placeholder="对搭档的期望、特殊情况说明等..." maxlength={200} onInput={(e) => onInput(e.detail.value)} />
    </View>
  )
}
