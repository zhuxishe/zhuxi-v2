import { describe, expect, it } from "vitest"
import { getSurveyWindowState, surveySubmissionError, formatSurveyTime } from "./survey-window"
import { parseSurveyOpening } from "./survey-opening"

const round = { status: "open", survey_start: "2026-09-29T09:00:00+09:00", survey_end: "2026-09-29T18:00:00+09:00" }

describe("survey collection window", () => {
  it.each([
    ["2026-09-29T08:59:59+09:00", "scheduled", "surveyNotStarted"],
    ["2026-09-29T09:00:00+09:00", "open", null],
    ["2026-09-29T17:59:59.999+09:00", "open", null],
    ["2026-09-29T18:00:00+09:00", "expired", "surveyExpired"],
    ["2026-09-30T09:00:00+09:00", "expired", "surveyExpired"],
  ])("at %s the window is %s", (now, state, error) => {
    expect(getSurveyWindowState(round, new Date(now))).toBe(state)
    expect(surveySubmissionError(round, new Date(now))).toBe(error)
  })

  it.each(["draft", "closed", "matched", "unknown"])("never admits a %s round during the time window", (status) => {
    expect(surveySubmissionError({ ...round, status }, new Date(round.survey_start))).toBe("surveyClosed")
  })

  it.each([
    { ...round, survey_start: "invalid" },
    { ...round, survey_end: "invalid" },
    { ...round, survey_end: round.survey_start },
  ])("rejects invalid dates", (invalid) => {
    expect(getSurveyWindowState(invalid)).toBe("invalid")
  })

  it("displays the deadline in Tokyo regardless of the machine time zone", () => {
    expect(formatSurveyTime("2026-09-29T09:00:00Z", "zh")).toContain("18:00")
    expect(formatSurveyTime("2026-09-29T15:00:00Z", "ja")).toContain("2026/09/30")
  })
})

describe("opening or reopening a survey", () => {
  const now = new Date("2026-09-29T10:00:00+09:00")
  it("interprets administrator inputs as Japan time and permits a scheduled opening", () => {
    expect(parseSurveyOpening({ surveyStart: "2026-09-30T09:00", surveyEnd: "2026-10-01T18:00" }, now)).toEqual({
      window: { survey_start: "2026-09-30T00:00:00.000Z", survey_end: "2026-10-01T09:00:00.000Z" },
    })
  })
  it.each([
    ["2026-09-28T09:00", "2026-09-29T10:00"],
    ["2026-10-01T18:00", "2026-10-01T18:00"],
    ["2026-10-02T18:00", "2026-10-01T18:00"],
    ["2026-02-30T09:00", "2026-10-01T18:00"],
    ["invalid", "2026-10-01T18:00"],
    ["2026-09-29T09:00", ""],
  ])("rejects invalid or expired input %s – %s", (surveyStart, surveyEnd) => {
    expect(parseSurveyOpening({ surveyStart, surveyEnd }, now).error).toBeTruthy()
  })
})
