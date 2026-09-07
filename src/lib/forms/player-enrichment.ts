import { PERSONALITY_DIMENSIONS } from "@/lib/constants/personality"
import * as options from "@/lib/constants/supplementary"
import { EMPTY_PERSONALITY, EMPTY_SUPPLEMENTARY } from "@/types"
import type { PersonalitySelfData, SupplementaryFormData } from "@/types"
import type { QuizConfig } from "@/types/quiz-config"

export type SupplementaryDraft = Omit<SupplementaryFormData, "accept_beginners" | "accept_cross_school"> & {
  accept_beginners: boolean | null
  accept_cross_school: boolean | null
}

export type PersonalityDraft = Omit<PersonalitySelfData, "extroversion" | "initiative" | "emotional_stability"> & {
  extroversion: number | null
  initiative: number | null
  emotional_stability: number | null
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function firstRecord(value: unknown) {
  return record(Array.isArray(value) ? value[0] : value)
}

export function buildSupplementaryDraft(interests: unknown, language: unknown): SupplementaryDraft {
  const source = { ...firstRecord(language), ...firstRecord(interests) }
  const defaults: SupplementaryDraft = { ...EMPTY_SUPPLEMENTARY, accept_beginners: null, accept_cross_school: null }
  const hasSupplementaryAnswers = Object.keys(defaults).some((key) => {
    const value = source[key]
    if (key === "accept_beginners" || key === "accept_cross_school") return value === false
    return Array.isArray(value) ? value.length > 0
      : typeof value === "string" ? value.trim().length > 0 : typeof value === "number"
  })
  // Core onboarding creates member_interests with legacy DEFAULT true values.
  // An otherwise empty supplementary section must still ask these questions.
  if (!hasSupplementaryAnswers && !firstRecord(language)) {
    source.accept_beginners = null
    source.accept_cross_school = null
  }
  // Project only editable fields; database IDs and other profile sections must never enter the payload.
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, source[key] ?? fallback])) as SupplementaryDraft
}

export function buildPersonalityDraft(existing: unknown): PersonalityDraft {
  const source = firstRecord(existing) ?? {}
  const defaults: PersonalityDraft = { ...EMPTY_PERSONALITY, extroversion: null, initiative: null, emotional_stability: null }
  // Onboarding can create a row containing only personality_tags and database-default scores.
  const hasAssessment = PERSONALITY_DIMENSIONS.some((dimension) => {
    const value = source[dimension.key]
    if (dimension.type === "slider") return typeof value === "number" && value !== 3
    return Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim().length > 0
  })
  if (!hasAssessment) return defaults
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, source[key] ?? fallback])) as PersonalityDraft
}

const singleOptions: Partial<Record<keyof SupplementaryDraft, readonly string[]>> = {
  activity_area: options.ACTIVITY_AREA_OPTIONS,
  japanese_level: options.JAPANESE_LEVEL_OPTIONS,
  game_type_pref: options.GAME_TYPE_PREF_OPTIONS,
  ideal_group_size: options.GROUP_SIZE_OPTIONS,
  activity_frequency: options.ACTIVITY_FREQUENCY_OPTIONS,
  budget_range: options.BUDGET_RANGE_OPTIONS,
  travel_radius: options.TRAVEL_RADIUS_OPTIONS,
  social_goal_primary: options.SOCIAL_GOAL_OPTIONS,
  social_goal_secondary: options.SOCIAL_GOAL_OPTIONS,
}

const multiOptions: Partial<Record<keyof SupplementaryDraft, readonly string[]>> = {
  communication_language_pref: options.COMMUNICATION_LANGUAGE_OPTIONS,
  scenario_mode_pref: options.SCENARIO_MODE_OPTIONS,
  scenario_theme_tags: options.SCENARIO_THEME_OPTIONS,
  script_preference: options.SCRIPT_PREFERENCE_OPTIONS,
  non_script_preference: options.NON_SCRIPT_PREFERENCE_OPTIONS,
  preferred_time_slots: options.TIME_SLOT_OPTIONS,
}

function validTags(value: unknown, allowed: readonly string[], required = false): value is string[] {
  return Array.isArray(value)
    && (!required || value.length > 0)
    && value.length <= allowed.length
    && new Set(value).size === value.length
    && value.every((item) => typeof item === "string" && allowed.includes(item))
}

export function parseSupplementary(value: unknown): SupplementaryDraft | null {
  const input = record(value)
  if (!input) return null
  const result: Record<string, unknown> = {}
  for (const [key, allowed] of Object.entries(singleOptions)) {
    const field = input[key]
    if (typeof field !== "string" || (field !== "" && !allowed.includes(field))) return null
    result[key] = field
  }
  for (const [key, allowed] of Object.entries(multiOptions)) {
    if (!validTags(input[key], allowed)) return null
    result[key] = [...input[key] as string[]]
  }
  if (typeof input.nearest_station !== "string" || input.nearest_station.trim().length > 100) return null
  result.nearest_station = input.nearest_station.trim()
  const year = input.graduation_year
  if (year !== null && (typeof year !== "number" || !Number.isInteger(year) || year < 1900 || year > 2100)) return null
  result.graduation_year = year
  for (const key of ["accept_beginners", "accept_cross_school"] as const) {
    if (input[key] !== null && typeof input[key] !== "boolean") return null
    result[key] = input[key]
  }
  return result as SupplementaryDraft
}

export function parsePersonality(value: unknown): PersonalitySelfData | null {
  const input = record(value)
  if (!input) return null
  const result: Record<string, unknown> = {}
  for (const dimension of PERSONALITY_DIMENSIONS) {
    const field = input[dimension.key]
    if (dimension.type === "slider") {
      if (typeof field !== "number" || !Number.isInteger(field) || field < 1 || field > 5) return null
    } else if (dimension.type === "multi") {
      if (!validTags(field, dimension.options ?? [], true)) return null
    } else if (typeof field !== "string" || !dimension.options?.includes(field)) return null
    result[dimension.key] = Array.isArray(field) ? [...field] : field
  }
  return result as unknown as PersonalitySelfData
}

export type QuizAnswer = { questionId: number; score: number }

export function parseQuizAnswers(value: unknown, config: QuizConfig): QuizAnswer[] | null {
  if (!Array.isArray(value) || config.questions.length === 0 || value.length !== config.questions.length) return null
  if (!Number.isFinite(config.scoring.minRaw) || !Number.isFinite(config.scoring.maxRaw)
    || config.scoring.maxRaw <= config.scoring.minRaw) return null
  const questions = new Map(config.questions.map((question) => [question.id, question]))
  if (questions.size !== config.questions.length) return null
  const seen = new Set<number>()
  const answers: QuizAnswer[] = []
  for (const item of value) {
    const answer = record(item)
    if (!answer || typeof answer.questionId !== "number" || !Number.isInteger(answer.questionId)
      || typeof answer.score !== "number" || !Number.isFinite(answer.score) || seen.has(answer.questionId)) return null
    const question = questions.get(answer.questionId)
    if (!question || !["E", "A", "O", "C", "N"].includes(question.dimension)
      || !question.options.some((option) => option.score === answer.score)) return null
    seen.add(answer.questionId)
    answers.push({ questionId: answer.questionId, score: answer.score })
  }
  return answers
}
