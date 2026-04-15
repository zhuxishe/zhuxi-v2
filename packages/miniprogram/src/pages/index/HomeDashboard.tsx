import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { buildMiniRoundCardState } from '../../lib/round-state'
import { DashboardData } from './types'

interface Props {
  dashboard: DashboardData
}

export function HomeDashboard({ dashboard }: Props) {
  const roundCard = buildMiniRoundCardState(dashboard.openRound, dashboard.hasSubmission)
  return (
    <View className="dashboard">
      <View className="welcome-card">
        <Text className="welcome-name">你好，{dashboard.name}</Text>
        <View className="status-badge success">
          <Text className="status-text">已批准</Text>
        </View>
      </View>

      {roundCard && (
        <View
          className="card"
          onClick={roundCard.canOpenSurvey ? () => Taro.navigateTo({ url: '/pages/survey/index' }) : undefined}
        >
          <Text className="card-label">{roundCard.title}</Text>
          <Text className="card-value">{roundCard.roundName}</Text>
          <Text className={`card-status ${roundCard.statusTone}`}>{roundCard.statusText}</Text>
          {roundCard.deadlineText ? <Text className="card-hint">{roundCard.deadlineText}</Text> : null}
        </View>
      )}

      <View className="card">
        <Text className="card-label">档案完成度</Text>
        <Text className="card-value">{dashboard.completeness.percentage}%</Text>
        <View className="progress-items">
          <ProgressItem label="身份信息" done={dashboard.completeness.identity} />
          <ProgressItem label="补充偏好" done={dashboard.completeness.supplementary} />
          <ProgressItem label="性格画像" done={dashboard.completeness.personality} />
          <ProgressItem label="性格测试" done={dashboard.completeness.quiz} />
        </View>
      </View>

      <View className="menu-list">
        <MenuItem title="我的匹配" desc="查看匹配结果" onClick={() => Taro.navigateTo({ url: '/pages/matches/index' })} />
        <MenuItem title="剧本库" desc="浏览已发布的剧本" onClick={() => Taro.navigateTo({ url: '/pages/scripts/index' })} />
        <MenuItem title="活动记录" desc="参加过的活动" onClick={() => Taro.navigateTo({ url: '/pages/activities/index' })} />
        <MenuItem title="性格测试" desc="15 题了解你的社交人格" onClick={() => Taro.navigateTo({ url: '/pages/quiz/index' })} />
      </View>
    </View>
  )
}

function MenuItem({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) {
  return (
    <View className="menu-item" onClick={onClick}>
      <View className="menu-text">
        <Text className="menu-title">{title}</Text>
        <Text className="menu-desc">{desc}</Text>
      </View>
      <Text className="menu-arrow">›</Text>
    </View>
  )
}

function ProgressItem({ label, done }: { label: string; done: boolean }) {
  return (
    <View className="progress-item">
      <Text className={`progress-dot ${done ? 'done' : ''}`}>{done ? '✓' : '○'}</Text>
      <Text className="progress-label">{label}</Text>
    </View>
  )
}
