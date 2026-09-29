export interface SurveyWindow {
  status: string
  survey_start: string
  survey_end: string
}

export type SurveyWindowState = "draft" | "scheduled" | "open" | "expired" | "closed" | "matched" | "invalid"

/** The opening instant is inclusive; the deadline is exclusive. */
export function getSurveyWindowState(round: SurveyWindow, now = new Date()): SurveyWindowState {
  if (round.status === "draft" || round.status === "closed" || round.status === "matched") return round.status
  const start = Date.parse(round.survey_start)
  const end = Date.parse(round.survey_end)
  if (round.status !== "open" || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "invalid"
  if (now.getTime() < start) return "scheduled"
  return now.getTime() >= end ? "expired" : "open"
}

export function surveySubmissionError(round: SurveyWindow, now = new Date()) {
  const state = getSurveyWindowState(round, now)
  if (state === "open") return null
  if (state === "scheduled") return "surveyNotStarted"
  return state === "expired" ? "surveyExpired" : "surveyClosed"
}

export function formatSurveyTime(value: string, locale = "zh") {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "—"
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "zh-CN", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(date)
}
