// Personality self-assessment dimensions (3b)
// 10 dimensions: 3 sliders + 2 multi-select + 5 single-select

export type DimensionType = "slider" | "single" | "multi"

export interface PersonalityDimension {
  key: string
  label: string
  description: string
  type: DimensionType
  options?: readonly string[]
  sliderLabels?: [string, string] // [low, high] labels for slider type
}

export const PERSONALITY_DIMENSIONS: PersonalityDimension[] = [
  {
    key: "extroversion", label: "外向度",
    description: "你在社交场合的能量来源",
    type: "slider", sliderLabels: ["内向安静", "外向活跃"],
  },
  {
    key: "initiative", label: "主动度",
    description: "你倾向于主动发起还是等待邀请",
    type: "slider", sliderLabels: ["等待邀请", "主动发起"],
  },
  {
    key: "expression_style_tags", label: "表达风格",
    description: "你的交流方式（可多选）",
    type: "multi", options: ["温和", "直率", "幽默", "理性", "倾听型"],
  },
  {
    key: "group_role_tags", label: "群体角色",
    description: "你在团体中通常扮演的角色（可多选）",
    type: "multi", options: ["组织者", "破冰者", "倾听者", "气氛组"],
  },
  {
    key: "warmup_speed", label: "熟络节奏",
    description: "你和新朋友熟悉的速度",
    type: "single", options: ["快速熟络", "先浅后深", "慢热稳定"],
  },
  {
    key: "planning_style", label: "计划性",
    description: "你对活动安排的态度",
    type: "single", options: ["计划型", "半计划", "随性"],
  },
  {
    key: "coop_compete_tendency", label: "合作竞技倾向",
    description: "你在游戏中的偏好",
    type: "single", options: ["偏合作", "均衡", "偏竞技"],
  },
  {
    key: "emotional_stability", label: "情绪稳定度",
    description: "你在压力或意外情况下的情绪反应",
    type: "slider", sliderLabels: ["容易波动", "非常稳定"],
  },
  {
    key: "boundary_strength", label: "边界强度",
    description: "你对个人空间和隐私的要求",
    type: "single", options: ["柔软", "适中", "偏强"],
  },
  {
    key: "reply_speed", label: "回复节奏",
    description: "你通常的消息回复速度",
    type: "single", options: ["秒回", "当天", "慢回可"],
  },
]
