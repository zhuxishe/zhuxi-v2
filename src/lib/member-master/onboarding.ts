import type { Gender, PreInterviewFormData } from "@/types"
import { EMPTY_FORM } from "@/types"
import type { OnboardingStep } from "./types"
import { isValidBirthDate } from "./birth-date"

export const ONBOARDING_DEGREE_OPTIONS = ["学部生", "修士", "博士", "交换留学", "语言学校", "研究生/预科", "其他"] as const

export function isOnboardingDegree(value: unknown): value is string {
  return typeof value === "string" && ONBOARDING_DEGREE_OPTIONS.some((option) => option === value)
}

export class OnboardingInputError extends Error {
  constructor() {
    super("Invalid onboarding input")
    this.name = "OnboardingInputError"
  }
}
export interface OnboardingIdentityDraft {
  full_name?: unknown
  nickname?: unknown
  gender?: unknown
  age_range?: unknown
  birth_date?: unknown
  nationality?: unknown
  current_city?: unknown
  school_name?: unknown
  department?: unknown
  degree_level?: unknown
  course_language?: unknown
  enrollment_year?: unknown
  hobby_tags?: unknown
  activity_type_tags?: unknown
  personality_self_tags?: unknown
  taboo_tags?: unknown
}

export function buildOnboardingStepPayload(
  step: OnboardingStep,
  input: unknown
): Record<string, unknown> {
  const data = requireRecord(input)

  switch (step) {
    case 1:
      return {
        full_name: requiredText(data.full_name),
        nickname: optionalText(data.nickname),
        gender: gender(data.gender),
        birth_date: requiredBirthDate(data.birth_date),
        nationality: requiredText(data.nationality),
        current_city: requiredText(data.current_city),
      }
    case 2:
      return {
        school_name: requiredText(data.school_name),
        department: optionalText(data.department),
        degree_level: requiredDegree(data.degree_level),
        course_language: optionalText(data.course_language),
        enrollment_year: optionalInteger(data.enrollment_year),
      }
    case 3:
      return {
        hobby_tags: stringArray(data.hobby_tags, { required: true, max: 8 }),
        activity_type_tags: stringArray(data.activity_type_tags, { required: true, max: 5 }),
      }
    case 4:
      return {
        personality_self_tags: stringArray(data.personality_self_tags, { required: true, max: 5 }),
        taboo_tags: stringArray(data.taboo_tags),
      }
    default:
      throw new OnboardingInputError()
  }
}

export function getOnboardingResumeStep(onboardingStep: number, identity?: OnboardingIdentityDraft | null): 0 | 1 | 2 | 3 {
  // Only incomplete onboarding reaches this page. Old submitted profiles stay unchanged.
  if (identity !== undefined && !isValidBirthDate(identity?.birth_date)) return 0
  if (identity && onboardingStep >= 2 && (!textOrEmpty(identity.school_name).trim() || !isOnboardingDegree(identity.degree_level))) return 1
  if (!Number.isInteger(onboardingStep) || onboardingStep <= 0) return 0
  if (onboardingStep >= 3) return 3
  return onboardingStep as 1 | 2
}

export function hydrateOnboardingDraft(
  identity: OnboardingIdentityDraft | null | undefined
): PreInterviewFormData {
  if (!identity) return cloneEmptyForm()

  return {
    full_name: textOrEmpty(identity.full_name),
    nickname: textOrEmpty(identity.nickname),
    gender: isGender(identity.gender) ? identity.gender : EMPTY_FORM.gender,
    age_range: textOrEmpty(identity.age_range),
    birth_date: isValidBirthDate(identity.birth_date) ? identity.birth_date : "",
    nationality: textOrEmpty(identity.nationality),
    current_city: textOrEmpty(identity.current_city),
    school_name: textOrEmpty(identity.school_name),
    department: textOrEmpty(identity.department),
    degree_level: textOrEmpty(identity.degree_level),
    course_language: textOrEmpty(identity.course_language),
    enrollment_year: integerOrNull(identity.enrollment_year),
    hobby_tags: stringsOrEmpty(identity.hobby_tags),
    activity_type_tags: stringsOrEmpty(identity.activity_type_tags),
    personality_self_tags: stringsOrEmpty(identity.personality_self_tags),
    taboo_tags: stringsOrEmpty(identity.taboo_tags),
  }
}

function cloneEmptyForm(): PreInterviewFormData {
  return {
    ...EMPTY_FORM,
    hobby_tags: [],
    activity_type_tags: [],
    personality_self_tags: [],
    taboo_tags: [],
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new OnboardingInputError()
  }
  return value as Record<string, unknown>
}

function requiredText(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OnboardingInputError()
  }
  return value.trim()
}

function requiredBirthDate(value: unknown): string {
  if (!isValidBirthDate(value)) throw new OnboardingInputError()
  return value
}

function requiredDegree(value: unknown): string {
  if (!isOnboardingDegree(value)) throw new OnboardingInputError()
  return value
}

function optionalText(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  if (typeof value !== "string") throw new OnboardingInputError()
  return value.trim() || null
}

function optionalInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  if (!Number.isInteger(value)) throw new OnboardingInputError()
  return Number(value)
}

function gender(value: unknown): Gender {
  if (!isGender(value)) throw new OnboardingInputError()
  return value
}

function isGender(value: unknown): value is Gender {
  return value === "male" || value === "female" || value === "other"
}

function stringArray(
  value: unknown,
  options: { required?: boolean; max?: number } = {}
) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new OnboardingInputError()
  }
  const normalized = [...new Set(value.map((item) => item.trim()).filter(Boolean))]
  if (options.required && normalized.length === 0) throw new OnboardingInputError()
  if (options.max && normalized.length > options.max) throw new OnboardingInputError()
  return normalized
}

function textOrEmpty(value: unknown) {
  return typeof value === "string" ? value : ""
}

function integerOrNull(value: unknown) {
  return Number.isInteger(value) ? Number(value) : null
}

function stringsOrEmpty(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...value]
    : []
}
