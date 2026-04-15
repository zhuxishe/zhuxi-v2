import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './success.scss'

export default function SurveySuccess() {
  return (
    <View className="success-page">
      <View className="success-card">
        <Text className="success-icon">✓</Text>
        <Text className="success-title">问卷提交成功</Text>
        <Text className="success-desc">你的匹配偏好已经保存，可以返回首页查看当前状态，也可以重新编辑问卷。</Text>
        <View className="success-actions">
          <View className="success-btn primary" onClick={() => Taro.reLaunch({ url: '/pages/index/index' })}>
            <Text className="success-btn-text light">返回首页</Text>
          </View>
          <View className="success-btn secondary" onClick={() => Taro.navigateBack()}>
            <Text className="success-btn-text">继续编辑</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
