import type { RoundContentConfig, RoundContentDraft, RoundText } from "@/types/matching-round"
import { normalizeRoundConfig } from "./round-config"
import { formatTokyoDateTimeLocal, parseTokyoDateTimeLocal } from "@/lib/player-activity/tokyo-datetime"

function validText(value: RoundText, limit: number) {
  return [value.zh, value.ja].every((text) => typeof text === "string" && text.length <= limit)
}
function validId(id: string) {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id) && !["__proto__", "prototype", "constructor"].includes(id)
}

export function isRoundDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}

function eventTime(value: string) {
  if (!value) return ""
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    const iso = parseTokyoDateTimeLocal(value)
    return formatTokyoDateTimeLocal(iso) === value ? iso : null
  }
  return /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
}

export function validateRoundConfig(raw: unknown): { config: RoundContentConfig; error?: never } | { error: string; config?: never } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || JSON.stringify(raw).length > 60000 || new TextEncoder().encode(JSON.stringify(raw)).length > 90000) return { error: "问卷配置格式无效或内容过长" }
  const config = normalizeRoundConfig(raw)
  if (config.titleJa.length > 160 || !validText(config.cardTitle, 160) || !validText(config.cardDescription, 500) || !validText(config.cardCta, 40)) return { error: "首页文案过长，请缩短后重试" }
  if (!validText(config.introduction, 6000) || !validText(config.location, 500) || !validText(config.fee, 300) || !validText(config.notice, 4000)) return { error: "活动介绍、地点或注意事项过长" }
  if (!validText(config.recruitmentCount, 100)) return { error: "募集人数说明过长，每种语言最多 100 字" }
  if (Object.values(config.labels).some((label) => label && !validText(label, 200))) return { error: "问题标题过长" }
  if (config.questions.length > 20) return { error: "最多添加 20 个补充问题" }
  const ids = new Set<string>()
  for (const question of config.questions) {
    if (!validId(question.id) || ids.has(question.id) || !["single", "multi", "text"].includes(question.type)) return { error: "问题标识或题型无效，请重新添加该问题" }
    ids.add(question.id)
    if (!question.label.zh.trim() || !validText(question.label, 300)) return { error: "请填写每道题的中文标题（最多 300 字）" }
    if (question.type === "text") {
      if (question.options.length) return { error: "简答题不能包含选项" }
      continue
    }
    if (question.options.length < 2 || question.options.length > 20) return { error: "选择题需要 2 至 20 个选项" }
    const optionIds = new Set<string>()
    for (const option of question.options) {
      if (!validId(option.id) || optionIds.has(option.id) || !option.label.zh.trim() || !validText(option.label, 200)) return { error: "请检查选项标识及中文文字，选项不能重复或为空" }
      optionIds.add(option.id)
    }
  }
  const start = eventTime(config.eventStart), end = eventTime(config.eventEnd)
  if (start === null || end === null || Boolean(start) !== Boolean(end) || (start && end && Date.parse(end) <= Date.parse(start))) return { error: "请填写有效的活动开始与结束时间（日本时间），结束必须晚于开始" }
  return { config: { ...config, eventStart: start, eventEnd: end } }
}

export function validateRoundDraft(input: RoundContentDraft): ReturnType<typeof validateRoundConfig> {
  if (typeof input.roundName !== "string" || !input.roundName.trim() || input.roundName.trim().length > 160) return { error: "请填写轮次名称（最多 160 字）" }
  if (!["matching", "registration", "announcement"].includes(input.purpose)) return { error: "请选择有效的用途" }
  if (!isRoundDate(input.activityStart) || !isRoundDate(input.activityEnd) || input.activityEnd < input.activityStart) return { error: "请填写有效的活动日期，结束日期不能早于开始日期" }
  if ((Date.parse(input.activityEnd) - Date.parse(input.activityStart)) / 86400000 > 99) return { error: "活动日期范围不能超过 100 天" }
  return validateRoundConfig(input.contentConfig)
}

export function validateRoundPublishing(purpose: string, config: RoundContentConfig, now = new Date()) {
  if (purpose !== "registration") return null
  const start = Date.parse(config.eventStart), end = Date.parse(config.eventEnd)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start <= now.getTime()) return "固定时间活动须设置未来的开始时间及结束时间，再开放报名"
  if (!config.location.zh.trim()) return "请先填写活动地点，再开放报名"
  return null
}
