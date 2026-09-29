import type { RoundContentConfig, RoundLabelKey, RoundPurpose, RoundQuestion, RoundText } from "@/types/matching-round"

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
const string = (value: unknown) => typeof value === "string" ? value : ""
const text = (value: unknown): RoundText => ({ zh: string(object(value).zh), ja: string(object(value).ja) })
export const ROUND_LABEL_KEYS: RoundLabelKey[] = ["gameType", "genderPref", "availability", "interestTags", "socialStyle", "message", "submit"]

export function getRoundPurpose(value: unknown): RoundPurpose {
  return value === "registration" || value === "announcement" ? value : "matching"
}

export function localizeRoundText(value: RoundText | undefined, locale: string, fallback = "") {
  return (locale === "ja" ? value?.ja.trim() || value?.zh.trim() : value?.zh.trim() || value?.ja.trim()) || fallback
}

/** Old rounds with an empty config keep every original matching module. */
export function normalizeRoundConfig(value: unknown): RoundContentConfig {
  const input = object(value)
  const modules = object(input.modules)
  const labels = object(input.labels)
  return {
    version: 1, titleJa: string(input.titleJa),
    cardTitle: text(input.cardTitle), cardDescription: text(input.cardDescription), cardCta: text(input.cardCta),
    introduction: text(input.introduction), location: text(input.location), fee: text(input.fee), notice: text(input.notice),
    eventStart: string(input.eventStart), eventEnd: string(input.eventEnd),
    modules: { interests: modules.interests !== false, social: modules.social !== false, message: modules.message !== false },
    labels: Object.fromEntries(ROUND_LABEL_KEYS.filter((key) => labels[key] !== undefined).map((key) => [key, text(labels[key])])),
    questions: Array.isArray(input.questions) ? input.questions.map((raw) => {
      const question = object(raw)
      return {
        id: string(question.id), type: question.type as RoundQuestion["type"], label: text(question.label), required: question.required === true,
        options: Array.isArray(question.options) ? question.options.map((option) => ({ id: string(object(option).id), label: text(object(option).label) })) : [],
      }
    }) : [],
  }
}

/** The answer contract excludes display wording, but includes question and option identities. */
export function roundAnswerStructure(purpose: RoundPurpose, config: RoundContentConfig) {
  return JSON.stringify({
    purpose, modules: config.modules, eventStart: config.eventStart, eventEnd: config.eventEnd,
    questions: config.questions.map(({ id, type, required, options }) => ({ id, type, required, options: options.map((option) => option.id) })),
  })
}

export function isRoundSetupError(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || error?.code === "PGRST204" || error?.code === "PGRST202"
}
export const ROUND_SETUP_ERROR = "内容编辑功能的数据库升级尚未完成，请先应用本次匹配管理迁移；原有匹配功能仍可使用。"
