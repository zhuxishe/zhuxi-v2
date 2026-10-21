import zh from "@/messages/zh.json"
import ja from "@/messages/ja.json"
import * as tags from "@/lib/constants/tags"
import * as supplementary from "@/lib/constants/supplementary"
import { PERSONALITY_DIMENSIONS } from "@/lib/constants/personality"
import { localizeTag } from "@/lib/constants/tags-i18n"
import { localizeSupplementary } from "@/lib/constants/supplementary-i18n"
import { localizePersonalityDesc, localizePersonalityLabel, localizePersonalityOption } from "@/lib/constants/personality-i18n"
import { buildDefaultQuizConfig } from "@/lib/constants/personality-quiz"
import { ONBOARDING_DEGREE_OPTIONS } from "@/lib/member-master/onboarding"
import type { QuizConfig } from "@/types/quiz-config"
import type { Answers, LocalizedText, Question, QuestionnaireKind, QuestionnaireOption, Template } from "./types"

export const BOOLEAN_FIELDS = ["accept_beginners", "accept_cross_school"] as const
export const YEAR_FIELDS = ["enrollment_year", "graduation_year"] as const
/** These values feed database enums/booleans and cannot be expanded by an editor. */
export const FIXED_CHOICE_FIELDS = ["gender", "degree_level", ...BOOLEAN_FIELDS] as const
export const INTERVIEW_CORE_FIELDS = ["full_name", "gender", "birth_date", "nationality", "current_city", "school_name", "degree_level", "hobby_tags", "activity_type_tags", "personality_self_tags"] as const

const text = (zh: string, ja: string = zh): LocalizedText => ({ zh, ja })
function message(group: "interview" | "supplementary" | "personality" | "quiz", key: string) {
  return text((zh[group] as Record<string, unknown>)[key] as string, (ja[group] as Record<string, unknown>)[key] as string)
}
function optionLabel(value: string) {
  const translated = localizeTag(value, "ja")
  return text(value, translated !== value ? translated : localizeSupplementary(value, "ja"))
}
function options(values: readonly (string | number)[]): QuestionnaireOption[] {
  return values.map((value, i) => ({ id: `option_${i + 1}`, value: String(value), label: optionLabel(String(value)) }))
}
function builtin(field: string, sectionId: string, type: Question["type"], label: LocalizedText, patch: Partial<Question> = {}): Question {
  return { id: field, builtinField: field, sectionId, type, label, required: false, active: true, locked: true, ...patch }
}

/** A fresh snapshot: callers can edit it without mutating code constants or another request. */
export function buildDefaultTemplate(kind: QuestionnaireKind, quizConfig?: QuizConfig): Template {
  if (kind === "interview") {
    const q = (field: string, section: string, type: Question["type"], key: string, patch: Partial<Question> = {}) =>
      builtin(field, section, type, message("interview", key), { required: INTERVIEW_CORE_FIELDS.some((key) => key === field), ...patch })
    return {
      kind, title: message("interview", "title"),
      sections: ["Basic", "Academic", "Interests", "Personality"].map((key) => ({ id: key.toLowerCase(), title: message("interview", `step${key}`) })),
      questions: [
        q("full_name", "basic", "text", "fullName", { maxLength: 100 }),
        q("nickname", "basic", "text", "nickname", { min: 2, maxLength: 20 }),
        q("gender", "basic", "single", "gender", { options: [
          { id: "option_1", value: "male", label: text("男", "男性") },
          { id: "option_2", value: "female", label: text("女", "女性") },
          { id: "option_3", value: "other", label: text("其他", "その他") },
        ] }),
        q("birth_date", "basic", "date", "birthDate", { description: message("interview", "birthDateHint") }),
        q("nationality", "basic", "single", "nationality", { options: options(tags.NATIONALITY_OPTIONS) }),
        q("current_city", "basic", "single", "currentCity", { options: options(tags.CITY_OPTIONS) }),
        q("school_name", "academic", "text", "school", { maxLength: 120 }),
        q("department", "academic", "text", "department", { maxLength: 120 }),
        q("degree_level", "academic", "single", "degreeLevel", { options: options(ONBOARDING_DEGREE_OPTIONS) }),
        q("course_language", "academic", "single", "courseLanguage", { options: options(tags.COURSE_LANGUAGE_OPTIONS) }),
        q("enrollment_year", "academic", "single", "enrollmentYear", { options: options(Array.from({ length: 10 }, (_, i) => 2020 + i)), min: 1900, max: 2100 }),
        q("hobby_tags", "interests", "multi", "hobbyTags", { options: options(tags.HOBBY_TAGS), maxSelections: 8, description: message("interview", "hobbyTagsHint") }),
        q("activity_type_tags", "interests", "multi", "activityTypeTags", { options: options(tags.ACTIVITY_TYPE_TAGS), maxSelections: 5, description: message("interview", "activityTypeTagsHint") }),
        q("personality_self_tags", "personality", "multi", "personalityTags", { options: options(tags.PERSONALITY_SELF_TAGS), maxSelections: 5, description: message("interview", "personalityTagsHint") }),
        q("taboo_tags", "personality", "multi", "tabooTags", { options: options(tags.TABOO_TAGS), description: message("interview", "tabooTagsHint") }),
      ],
    }
  }
  if (kind === "supplementary") {
    const q = (field: string, section: string, type: Question["type"], key: string, values?: readonly (string | number)[], patch: Partial<Question> = {}) =>
      builtin(field, section, type, message("supplementary", key), { ...(values ? { options: options(values) } : {}), ...patch })
    return {
      kind, title: message("supplementary", "title"),
      sections: ["location", "language", "activities", "social"].map((id, i) => ({ id, title: message("supplementary", `step${i + 1}`) })),
      questions: [
        q("activity_area", "location", "single", "activityArea", supplementary.ACTIVITY_AREA_OPTIONS),
        q("nearest_station", "location", "text", "nearestStation", undefined, { maxLength: 100 }),
        q("graduation_year", "location", "single", "graduationYear", supplementary.GRADUATION_YEAR_OPTIONS, { min: 1900, max: 2100 }),
        q("communication_language_pref", "language", "multi", "languagePref", supplementary.COMMUNICATION_LANGUAGE_OPTIONS, { description: message("supplementary", "languagePrefHint") }),
        q("japanese_level", "language", "single", "japaneseLevel", supplementary.JAPANESE_LEVEL_OPTIONS),
        q("game_type_pref", "activities", "single", "gameTypePref", supplementary.GAME_TYPE_PREF_OPTIONS),
        q("scenario_mode_pref", "activities", "multi", "scenarioMode", supplementary.SCENARIO_MODE_OPTIONS, { description: message("supplementary", "scenarioModeHint") }),
        q("scenario_theme_tags", "activities", "multi", "scenarioTheme", supplementary.SCENARIO_THEME_OPTIONS, { description: message("supplementary", "scenarioThemeHint") }),
        q("ideal_group_size", "activities", "single", "groupSize", supplementary.GROUP_SIZE_OPTIONS),
        q("script_preference", "activities", "multi", "scriptPref", supplementary.SCRIPT_PREFERENCE_OPTIONS),
        q("non_script_preference", "activities", "multi", "nonScriptPref", supplementary.NON_SCRIPT_PREFERENCE_OPTIONS),
        q("activity_frequency", "activities", "single", "frequency", supplementary.ACTIVITY_FREQUENCY_OPTIONS),
        q("preferred_time_slots", "activities", "multi", "timeSlots", supplementary.TIME_SLOT_OPTIONS, { description: message("supplementary", "timeSlotsHint") }),
        q("budget_range", "activities", "single", "budget", supplementary.BUDGET_RANGE_OPTIONS),
        q("travel_radius", "activities", "single", "travelRadius", supplementary.TRAVEL_RADIUS_OPTIONS),
        q("social_goal_primary", "social", "single", "goalPrimary", supplementary.SOCIAL_GOAL_OPTIONS),
        q("social_goal_secondary", "social", "single", "goalSecondary", supplementary.SOCIAL_GOAL_OPTIONS),
        ...BOOLEAN_FIELDS.map((field, i) => q(field, "social", "single", i === 0 ? "acceptBeginners" : "acceptCrossSchool", undefined, {
          options: [
            { id: "option_1", value: "true", label: message("supplementary", "yes") },
            { id: "option_2", value: "false", label: message("supplementary", "no") },
          ],
        })),
      ],
    }
  }
  if (kind === "personality") {
    return {
      kind, title: message("personality", "title"),
      sections: [{ id: "personality", title: message("personality", "title") }],
      questions: PERSONALITY_DIMENSIONS.map((d) => builtin(d.key, "personality", d.type === "slider" ? "rating" : d.type,
        text(d.label, localizePersonalityLabel(d.label, "ja")), {
          required: true,
          description: text(d.description, localizePersonalityDesc(d.description, "ja")),
          ...(d.type === "slider" ? { min: 1, max: 5 } : {
            options: d.options!.map((value, i) => ({ id: `option_${i + 1}`, value, label: text(value, localizePersonalityOption(value, "ja")) })),
          }),
        })),
    }
  }
  const config = structuredClone(quizConfig ?? buildDefaultQuizConfig())
  return {
    kind, title: message("quiz", "pageTitle"), sections: [{ id: "quiz", title: message("quiz", "title") }], quizConfig: config,
    questions: config.questions.map((q) => builtin(`quiz_${q.id}`, "quiz", "single", text(q.text), {
      required: true, dimension: q.dimension,
      options: q.options.map((option, i) => ({ id: `option_${i + 1}`, value: String(option.score), label: text(option.text), score: option.score })),
    })),
  }
}

function copyAnswer(value: unknown): Answers[string] | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return value
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return [...value]
  return undefined
}
export function answersFromLegacy(template: Template, legacy: Record<string, unknown>): Answers {
  const result: Answers = {}
  for (const q of template.questions) {
    if (!q.builtinField) continue
    const value = copyAnswer(legacy[q.builtinField])
    if (value !== undefined) result[q.id] = value
  }
  if (template.kind === "quiz" && Array.isArray(legacy.answers)) {
    for (const answer of legacy.answers as { questionId?: unknown; score?: unknown }[]) {
      if (!answer || !Number.isInteger(answer.questionId) || typeof answer.score !== "number" || !Number.isFinite(answer.score)) continue
      const q = template.questions.find((q) => q.builtinField === `quiz_${answer.questionId}`)
      const option = q?.options?.find((option) => option.score === answer.score)
      if (q && option) result[q.id] = Number(option.value)
    }
  }
  return result
}
export function answersToLegacy(template: Template, answers: Answers): Answers {
  const result: Answers = {}
  for (const q of template.questions) {
    if (!q.builtinField || !Object.hasOwn(answers, q.id)) continue
    let value = copyAnswer(answers[q.id])
    if (value === undefined) continue
    if (BOOLEAN_FIELDS.some((field) => field === q.builtinField) && typeof value === "string") value = value === "true" ? true : value === "false" ? false : value
    if ((YEAR_FIELDS.some((field) => field === q.builtinField) || template.kind === "quiz") && typeof value === "string" && value.trim() && Number.isFinite(Number(value))) value = Number(value)
    result[q.builtinField] = value
  }
  return result
}

/** Keep the existing scorer and type naming config; derive scored questions from this version. */
export function quizTemplateToConfig(template: Template): QuizConfig {
  const config = structuredClone(template.quizConfig ?? buildDefaultQuizConfig())
  const used = new Set<number>()
  config.questions = template.questions.filter((q) => q.active && q.type === "single" && q.dimension).map((q) => {
    const builtinId = /^quiz_(\d+)$/.exec(q.builtinField ?? q.id)
    let id = builtinId ? Number(builtinId[1]) : Array.from(q.id).reduce((hash, char) => (Math.imul(hash, 31) + char.codePointAt(0)!) >>> 0, 2166136261)
    while (used.has(id)) id++
    used.add(id)
    return { id, dimension: q.dimension!, text: q.label.zh, options: (q.options ?? []).map((option) => ({ text: option.label.zh, score: option.score ?? Number(option.value) })) }
  })
  return config
}
export const templateToQuizConfig = quizTemplateToConfig
export const templateQuizConfig = quizTemplateToConfig
export const getTemplateQuizConfig = quizTemplateToConfig

export function quizAnswersFromTemplate(template: Template, answers: Answers): { questionId: number; score: number }[] {
  const config = quizTemplateToConfig(template)
  const scored = template.questions.filter((q) => q.active && q.type === "single" && q.dimension)
  return scored.flatMap((q, i) => {
    const option = q.options?.find((option) => option.value === String(answers[q.id]))
    return option && Number.isFinite(option.score) ? [{ questionId: config.questions[i].id, score: option.score! }] : []
  })
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, canonical(val)]))
  return value
}
export function isBaselineTemplate(template: Template, baseline: Template): boolean {
  return JSON.stringify(canonical(template)) === JSON.stringify(canonical(baseline))
}
