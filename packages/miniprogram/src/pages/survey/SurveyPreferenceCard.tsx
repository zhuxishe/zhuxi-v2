import { View, Text } from '@tarojs/components'
import { GAME_TYPES, GENDER_PREFS, INTEREST_TAGS, SOCIAL_STYLES } from './survey-constants'

interface Props {
  gameType: string
  genderPref: string
  socialStyle: string
  interestTags: string[]
  onGameType: (value: string) => void
  onGenderPref: (value: string) => void
  onSocialStyle: (value: string) => void
  onToggleInterest: (value: string) => void
}

export function SurveyPreferenceCard(props: Props) {
  return (
    <View className="form-card">
      <Text className="section-title">玩本类型 *</Text>
      <TagGrid options={GAME_TYPES} selected={[props.gameType]} onToggle={props.onGameType} single />

      <Text className="section-title">搭档性别偏好 *</Text>
      <TagGrid options={GENDER_PREFS} selected={[props.genderPref]} onToggle={props.onGenderPref} single />

      <Text className="section-title">社交风格</Text>
      <TagGrid options={SOCIAL_STYLES} selected={props.socialStyle ? [props.socialStyle] : []} onToggle={(v) => props.onSocialStyle(props.socialStyle === v ? '' : v)} single />

      <Text className="section-title">感兴趣的剧本类型</Text>
      <TagGrid options={INTEREST_TAGS} selected={props.interestTags} onToggle={props.onToggleInterest} />
    </View>
  )
}

function TagGrid({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void; single?: boolean }) {
  return (
    <View className="tag-grid">
      {options.map((t) => (
        <View key={t} className={`tag ${selected.includes(t) ? 'active' : ''}`} onClick={() => onToggle(t)}>
          <Text className="tag-text">{t}</Text>
        </View>
      ))}
    </View>
  )
}
