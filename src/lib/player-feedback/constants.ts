import type {
  AdminFeedbackActionState,
  PlayerFeedbackActionState,
} from "@/types/player-feedback"

export const PLAYER_FEEDBACK_INITIAL_STATE: PlayerFeedbackActionState = {}
export const ADMIN_FEEDBACK_INITIAL_STATE: AdminFeedbackActionState = {}

export const PLAYER_FEEDBACK_CATEGORY_LABELS = {
  product: "产品功能",
  activity: "活动内容",
  matching: "匹配体验",
  community: "社区功能",
  other: "其他",
} as const

export const PLAYER_FEEDBACK_STATUS_LABELS = {
  pending: "待处理",
  in_progress: "处理中",
  completed: "已完成",
} as const
