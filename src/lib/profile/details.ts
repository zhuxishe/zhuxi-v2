import { localizeTag } from "@/lib/constants/tags-i18n"
import { localizeSupplementary } from "@/lib/constants/supplementary-i18n"
import { localizePersonalityOption } from "@/lib/constants/personality-i18n"
import { buildPersonalityDraft, buildSupplementaryDraft } from "@/lib/forms/player-enrichment"

export const REGISTRATION_FIELDS = [
  "full_name", "nickname", "gender", "age_range", "nationality", "current_city",
  "school_name", "department", "degree_level", "course_language", "enrollment_year",
  "hobby_tags", "activity_type_tags", "personality_self_tags", "taboo_tags",
] as const

export const SUPPLEMENTARY_FIELDS = [
  "activity_area", "nearest_station", "graduation_year", "communication_language_pref",
  "japanese_level", "game_type_pref", "scenario_mode_pref", "scenario_theme_tags",
  "ideal_group_size", "script_preference", "non_script_preference", "activity_frequency",
  "preferred_time_slots", "budget_range", "travel_radius", "social_goal_primary",
  "social_goal_secondary", "accept_beginners", "accept_cross_school",
] as const

export const PERSONALITY_FIELDS = [
  "extroversion", "initiative", "expression_style_tags", "group_role_tags", "warmup_speed",
  "planning_style", "coop_compete_tendency", "emotional_stability", "boundary_strength", "reply_speed",
] as const

export const QUIZ_RESULT_FIELDS = [
  "personality_type", "score_e", "score_a", "score_o", "score_c", "score_n", "completed_at",
] as const

const EDITABLE_REGISTRATION_FIELDS = new Set<string>([
  "full_name", "gender", "nickname", "school_name", "department",
])

export const REGISTRATION_READONLY_FIELDS = REGISTRATION_FIELDS.filter(
  (field) => !EDITABLE_REGISTRATION_FIELDS.has(field),
)

type ProfileRecord = Record<string, unknown> | null

export interface PlayerProfileDetails {
  identity: ProfileRecord
  language: ProfileRecord
  interests: ProfileRecord
  personality: ProfileRecord
  quiz: ProfileRecord
}

export interface ProfileDetailRow {
  key: string
  label: string
  value: string
  missing: boolean
}

export interface ProfileDetailSection {
  key: string
  title: string
  rows: ProfileDetailRow[]
}

export type ProfileDetailsTranslator = (key: string) => string

const FREE_TEXT_FIELDS = new Set([
  "full_name", "nickname", "school_name", "department", "nearest_station", "personality_type",
])

const DEGREE_LABELS: Record<string, string> = {
  undergraduate: "学部生", master: "修士", doctoral: "博士", exchange: "交换留学",
  language_school: "语言学校", other: "其他",
}

function localizeValue(value: string, field: string, locale: string) {
  if (FREE_TEXT_FIELDS.has(field)) return value
  const normalized = field === "degree_level" ? (DEGREE_LABELS[value] ?? value) : value
  if ((PERSONALITY_FIELDS as readonly string[]).includes(field)) {
    return localizePersonalityOption(normalized, locale)
  }
  const tag = localizeTag(normalized, locale)
  return tag !== normalized ? tag : localizeSupplementary(normalized, locale)
}

export function formatProfileDetailValue(
  value: unknown,
  field: string,
  locale: string,
  t: ProfileDetailsTranslator,
): Pick<ProfileDetailRow, "value" | "missing"> {
  if (value == null || (typeof value === "string" && !value.trim())) {
    return { value: t("notProvided"), missing: true }
  }
  if (Array.isArray(value)) {
    const values = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    return values.length > 0
      ? { value: values.map((item) => localizeValue(item, field, locale)).join("、"), missing: false }
      : { value: t("noneSelected"), missing: true }
  }
  if (typeof value === "boolean") return { value: t(value ? "yes" : "no"), missing: false }
  if (typeof value === "number" && Number.isFinite(value)) {
    const suffix = field.startsWith("score_") ? " / 100"
      : ["extroversion", "initiative", "emotional_stability"].includes(field) ? " / 5" : ""
    return { value: `${value}${suffix}`, missing: false }
  }
  if (typeof value === "string") {
    if (field === "gender" && ["male", "female", "other"].includes(value)) {
      return { value: t(`gender.${value}`), missing: false }
    }
    if (field === "completed_at") {
      const date = new Date(value)
      if (!Number.isNaN(date.getTime())) return {
        value: new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "zh-CN", {
          timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", hour12: false,
        }).format(date),
        missing: false,
      }
    }
    return { value: localizeValue(value, field, locale), missing: false }
  }
  return { value: t("notProvided"), missing: true }
}

export function buildProfileDetailRows(
  record: ProfileRecord,
  fields: readonly string[],
  locale: string,
  t: ProfileDetailsTranslator,
): ProfileDetailRow[] {
  return fields.map((key) => ({
    key,
    label: t(`fields.${key}`),
    ...formatProfileDetailValue(record?.[key], key, locale, t),
  }))
}

export function buildProfileDetailSections(
  details: PlayerProfileDetails,
  locale: string,
  t: ProfileDetailsTranslator,
): ProfileDetailSection[] {
  return [
    { key: "identity", fields: REGISTRATION_FIELDS, record: details.identity },
    { key: "supplementary", fields: SUPPLEMENTARY_FIELDS, record: buildSupplementaryDraft(details.interests, details.language) },
    { key: "personality", fields: PERSONALITY_FIELDS, record: buildPersonalityDraft(details.personality) },
    { key: "quiz", fields: QUIZ_RESULT_FIELDS, record: details.quiz },
  ].map(({ key, fields, record }) => ({
    key,
    title: t(`sections.${key}`),
    rows: buildProfileDetailRows(record, fields, locale, t),
  }))
}
