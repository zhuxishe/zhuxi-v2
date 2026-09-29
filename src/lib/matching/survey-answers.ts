import type { RoundContentConfig, RoundPurpose, SurveyAnswers } from "@/types/matching-round"
import { validateCustomAnswers } from "./custom-answers"

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value)
const text = (value: unknown, max: number) => value === null || (typeof value === "string" && value.length <= max)
const SLOTS = ["上午", "下午", "晚上"]

function validateAvailability(value: unknown, start: string, end: string) {
  if (!record(value) || Object.keys(value).length > 100) return { error: "invalidSurveyInput" } as const
  const result: Record<string, string[]> = {}
  for (const [date, slots] of Object.entries(value)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < start || date > end
      || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date
      || !Array.isArray(slots) || slots.length > 3 || new Set(slots).size !== slots.length
      || slots.some((slot) => typeof slot !== "string" || !SLOTS.includes(slot))) {
      return { error: "invalidSurveyInput" } as const
    }
    if (slots.length > 0) result[date] = slots
  }
  return Object.keys(result).length ? { data: result } as const : { error: "noTimeSlot" } as const
}

/** Validate untrusted action input; hidden matching fields never affect an activity signup. */
export function validateSurveyAnswers(input: unknown, purpose: RoundPurpose, config: RoundContentConfig, start: string, end: string):
  { data: SurveyAnswers; error?: never } | { error: string; data?: never } {
  if (purpose === "announcement") return { error: "surveyReadOnly" }
  if (!record(input)) return { error: "invalidSurveyInput" }
  const custom = validateCustomAnswers(config.questions, input.customAnswers)
  if (custom.error) return { error: custom.error }
  const data: SurveyAnswers = {
    gameTypePref: "都可以", genderPref: "都可以", availability: {}, interestTags: [],
    socialStyle: null, message: null, customAnswers: custom.data,
  }
  if (purpose === "registration") return { data }
  if (typeof input.gameTypePref !== "string" || !["双人", "多人", "都可以"].includes(input.gameTypePref)
    || typeof input.genderPref !== "string" || !["男", "女", "都可以"].includes(input.genderPref)) return { error: "invalidSurveyInput" }
  const availability = validateAvailability(input.availability, start, end)
  if (availability.error) return { error: availability.error }
  data.gameTypePref = input.gameTypePref
  data.genderPref = input.genderPref
  data.availability = availability.data
  if (config.modules.interests) {
    if (!Array.isArray(input.interestTags) || input.interestTags.length > 50
      || input.interestTags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.length > 100)) return { error: "invalidSurveyInput" }
    data.interestTags = [...new Set(input.interestTags)]
  }
  if (config.modules.social) {
    if (!text(input.socialStyle, 100)) return { error: "invalidSurveyInput" }
    data.socialStyle = typeof input.socialStyle === "string" ? input.socialStyle.trim() || null : null
  }
  if (config.modules.message) {
    if (!text(input.message, 2000)) return { error: "invalidSurveyInput" }
    data.message = typeof input.message === "string" ? input.message.trim() || null : null
  }
  return { data }
}
