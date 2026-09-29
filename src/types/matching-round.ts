export type RoundPurpose = "matching" | "registration" | "announcement"
export interface RoundText { zh: string; ja: string }
export interface RoundQuestion {
  id: string
  type: "single" | "multi" | "text"
  label: RoundText
  required: boolean
  options: { id: string; label: RoundText }[]
}
export type RoundLabelKey = "gameType" | "genderPref" | "availability" | "interestTags" | "socialStyle" | "message" | "submit"
export interface RoundContentConfig {
  version: 1
  titleJa: string
  cardTitle: RoundText
  cardDescription: RoundText
  cardCta: RoundText
  introduction: RoundText
  location: RoundText
  fee: RoundText
  notice: RoundText
  eventStart: string
  eventEnd: string
  modules: { interests: boolean; social: boolean; message: boolean }
  labels: Partial<Record<RoundLabelKey, RoundText>>
  questions: RoundQuestion[]
}
export interface SurveyAnswers {
  gameTypePref: string
  genderPref: string
  availability: Record<string, string[]>
  interestTags: string[]
  socialStyle: string | null
  message: string | null
  customAnswers: Record<string, string | string[]>
}
export interface RoundContentDraft {
  roundName: string
  surveyStart: string
  surveyEnd: string
  activityStart: string
  activityEnd: string
  purpose: RoundPurpose
  contentConfig: RoundContentConfig
}
export interface RoundRecord {
  id: string
  round_name: string
  status: string
  survey_start: string
  survey_end: string
  activity_start: string
  activity_end: string
  purpose?: string
  content_config?: unknown
  config_revision?: number
  created_at?: string | null
}
