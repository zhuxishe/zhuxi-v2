import type { RoundContentConfig, RoundRecord } from "@/types/matching-round"
import { getRoundPurpose, localizeRoundText, normalizeRoundConfig } from "./round-config"
import { getSurveyWindowState, type SurveyWindowState } from "./survey-window"
import { roundHref } from "./round-display"

export function participationRecordHref(roundId: string) {
  return `/app/matches/rounds/${encodeURIComponent(roundId)}`
}

export function participationEditHref(roundId: string) {
  return `${roundHref(roundId)}&from=participation`
}

export function canEditParticipation(round: RoundRecord, state: SurveyWindowState) {
  return state === "open" && getRoundPurpose(round.purpose) !== "announcement"
}

export function groupParticipationRecords<T extends { round: RoundRecord }>(records: T[], now: Date) {
  const current: T[] = [], history: T[] = []
  for (const record of records) {
    const config = normalizeRoundConfig(record.round.content_config)
    const upcomingRegistration = getRoundPurpose(record.round.purpose) === "registration"
      && Date.parse(config.eventEnd || config.eventStart) >= now.getTime()
    if (upcomingRegistration || canEditParticipation(record.round, getSurveyWindowState(record.round, now))) current.push(record)
    else history.push(record)
  }
  current.sort((a, b) => Date.parse(a.round.survey_end) - Date.parse(b.round.survey_end))
  return { current, history }
}

export function participationStatus(round: RoundRecord, state: SurveyWindowState) {
  if (state === "open") return getRoundPurpose(round.purpose) === "registration" ? "registered" : "submitted"
  if (state === "matched") return "collectionComplete"
  if (state === "scheduled") return "notOpen"
  return getRoundPurpose(round.purpose) === "registration" ? "registrationClosed" : "closed"
}

interface CustomAnswerDisplay {
  id: string
  label: string
  values: string[]
  unavailable: boolean
}

/** Never guess an old question/option label from its internal ID. */
export function participationCustomAnswers(config: RoundContentConfig, answers: unknown, locale: string): CustomAnswerDisplay[] {
  const values = answers && typeof answers === "object" && !Array.isArray(answers) ? answers as Record<string, unknown> : {}
  const rows = config.questions.map((question) => {
    const answer = values[question.id]
    const raw = typeof answer === "string" ? [answer] : Array.isArray(answer) ? answer.filter((value): value is string => typeof value === "string") : []
    let unavailable = false
    const display = raw.map((value) => {
      if (question.type === "text") return value
      const option = question.options.find((item) => item.id === value)
      if (!option) { unavailable = true; return "" }
      return localizeRoundText(option.label, locale)
    }).filter(Boolean)
    return { id: question.id, label: localizeRoundText(question.label, locale), values: display, unavailable }
  })
  for (const id of Object.keys(values)) {
    if (!config.questions.some((question) => question.id === id)) rows.push({ id, label: "", values: [], unavailable: true })
  }
  return rows
}

export function participationAvailability(value: unknown): { date: string; slots: string[] }[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  return Object.entries(value).flatMap(([date, slots]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(slots)) return []
    const valid = slots.filter((slot): slot is string => typeof slot === "string" && ["上午", "下午", "晚上"].includes(slot))
    return valid.length ? [{ date, slots: valid }] : []
  }).sort((a, b) => a.date.localeCompare(b.date))
}
