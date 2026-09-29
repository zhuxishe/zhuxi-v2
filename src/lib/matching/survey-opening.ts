import { formatTokyoDateTimeLocal, parseTokyoDateTimeLocal } from "@/lib/player-activity/tokyo-datetime"

export interface SurveyOpeningInput { surveyStart: string; surveyEnd: string }

export function parseSurveyOpening(input: SurveyOpeningInput, now = new Date()) {
  const values = [input.surveyStart, input.surveyEnd]
  if (values.some((value) => typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))) {
    return { error: "请填写有效的问卷开放时间和截止时间（日本时间）" } as const
  }
  const [start, end] = values.map((value) => parseTokyoDateTimeLocal(value))
  if (values.some((value, index) => formatTokyoDateTimeLocal(index === 0 ? start : end) !== value)) {
    return { error: "问卷时间无效，请重新选择" } as const
  }
  if (Date.parse(end) <= Date.parse(start)) return { error: "问卷截止时间必须晚于开放时间" } as const
  if (Date.parse(end) <= now.getTime()) return { error: "问卷已到期，请设置未来的截止时间" } as const
  return { window: { survey_start: start, survey_end: end } } as const
}
