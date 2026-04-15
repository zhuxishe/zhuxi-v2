import { View, Text } from '@tarojs/components'
import { formatDate, TIME_SLOTS } from './survey-constants'

interface Props {
  days: string[]
  availability: Record<string, string[]>
  onToggleSlot: (date: string, slot: string) => void
}

export function SurveyAvailabilityCard({ days, availability, onToggleSlot }: Props) {
  return (
    <View className="form-card">
      <Text className="section-title">可用时间 *（未来14天）</Text>
      <View className="time-grid">
        <View className="time-header">
          <Text className="time-corner"></Text>
          {TIME_SLOTS.map((s) => <Text key={s} className="time-slot-label">{s}</Text>)}
        </View>
        {days.map((date) => (
          <View key={date} className="time-row">
            <Text className="time-date">{formatDate(date)}</Text>
            {TIME_SLOTS.map((slot) => (
              <View
                key={slot}
                className={`time-cell ${(availability[date] || []).includes(slot) ? 'active' : ''}`}
                onClick={() => onToggleSlot(date, slot)}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}
