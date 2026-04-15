import { View, Text } from '@tarojs/components'
import { MiniPersonalityDimension, MiniPersonalityFormData } from '../../lib/personality'

interface Props {
  dimension: MiniPersonalityDimension
  value: MiniPersonalityFormData[keyof MiniPersonalityFormData]
  onSliderChange?: (value: number) => void
  onSingleChange?: (value: string) => void
  onMultiToggle?: (value: string) => void
}

export function PersonalityField({ dimension, value, onSliderChange, onSingleChange, onMultiToggle }: Props) {
  return (
    <View className="score-section">
      <Text className="score-label">{dimension.label}</Text>
      <Text className="score-desc">{dimension.description}</Text>

      {dimension.type === 'slider' && (
        <>
          <View className="slider-hints">
            <Text className="slider-hint">{dimension.sliderLabels?.[0]}</Text>
            <Text className="slider-hint">{dimension.sliderLabels?.[1]}</Text>
          </View>
          <View className="score-select">
            {[1, 2, 3, 4, 5].map((n) => (
              <View
                key={n}
                className={`score-dot ${value === n ? 'active' : ''}`}
                onClick={() => onSliderChange?.(n)}
              >
                <Text className="score-dot-text">{n}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {dimension.options && (
        <View className="tag-grid">
          {dimension.options.map((option) => {
            const isActive = Array.isArray(value) ? value.includes(option) : value === option
            const handleClick = () => {
              if (dimension.type === 'multi') onMultiToggle?.(option)
              if (dimension.type === 'single') onSingleChange?.(option)
            }

            return (
              <View key={option} className={`tag ${isActive ? 'active' : ''}`} onClick={handleClick}>
                <Text className="tag-text">{option}</Text>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}
