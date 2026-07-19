export const PLAYER_FEEDBACK_CATEGORIES = [
  "product",
  "activity",
  "matching",
  "community",
  "other",
] as const

export const PLAYER_FEEDBACK_STATUSES = [
  "pending",
  "in_progress",
  "completed",
] as const

export type PlayerFeedbackCategory = (typeof PLAYER_FEEDBACK_CATEGORIES)[number]
export type PlayerFeedbackStatus = (typeof PLAYER_FEEDBACK_STATUSES)[number]

export interface PlayerFeedbackActionState {
  success?: true
  error?: string
  fieldErrors?: { category?: string; content?: string }
}

export interface AdminFeedbackActionState {
  success?: true
  error?: string
}

export interface PlayerFeedbackRow {
  id: string
  member_id: string
  member_name_snapshot: string
  category: PlayerFeedbackCategory
  content: string
  page_path: string
  locale: "zh" | "ja"
  status: PlayerFeedbackStatus
  admin_note: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}
