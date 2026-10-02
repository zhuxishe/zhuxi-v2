import { describe, expect, it } from "vitest"
import { normalizeRoundConfig } from "./round-config"
import { canCancelRegistration, canEditParticipation, canReregisterParticipation, groupParticipationRecords, participationAvailability, participationCustomAnswers, participationEditHref, participationRecordHref, participationStatus } from "./participation-display"
import { getSurveyWindowState } from "./survey-window"
import type { RoundRecord } from "@/types/matching-round"

const round: RoundRecord = { id: "round", round_name: "活动", purpose: "registration", status: "open", survey_start: "2026-09-29T00:00:00Z", survey_end: "2026-09-30T00:00:00Z", activity_start: "2026-10-01", activity_end: "2026-10-02" }

describe("participation record presentation", () => {
  it("keeps a zero-question signup current and cancellable without offering an empty edit form", () => {
    expect(canEditParticipation(round, "open")).toBe(false)
    expect(canCancelRegistration(round, "open")).toBe(true)
    expect(groupParticipationRecords([{ round }], new Date("2026-09-29T12:00:00Z"))).toEqual({ current: [{ round }], history: [] })
  })

  it("offers editing for configured registration questions and preserves matching questionnaires", () => {
    const withQuestions = { ...round, content_config: { questions: [{ id: "note", type: "text", label: { zh: "备注" } }] } }
    expect(canEditParticipation(withQuestions, "open")).toBe(true)
    expect(canEditParticipation(withQuestions, "expired")).toBe(false)
    expect(canEditParticipation(withQuestions, "open", "2026-09-29T08:00:00Z")).toBe(false)
    expect(canEditParticipation({ ...round, purpose: "matching" }, "open")).toBe(true)
    expect(canEditParticipation({ ...round, purpose: "announcement" }, "open")).toBe(false)
  })

  it("allows cancellation independently of questions only for a valid open registration", () => {
    expect(canCancelRegistration(round, "open", "2026-09-29T08:00:00Z")).toBe(false)
    for (const state of ["scheduled", "expired", "closed", "matched"] as const) expect(canCancelRegistration(round, state)).toBe(false)
    expect(canCancelRegistration({ ...round, purpose: "matching" }, "open")).toBe(false)
  })

  it("keeps record and edit destinations inside the app with a fixed participation source", () => {
    expect(participationRecordHref("round/id?from=outside")).toBe("/app/matches/rounds/round%2Fid%3Ffrom%3Doutside")
    expect(participationEditHref("round&id=outside")).toBe("/app/matching/survey?round=round%26id%3Doutside&from=participation")
  })

  it("stops offering edit at the exact deadline but retains the record in history", () => {
    const deadline = new Date(round.survey_end)
    const state = getSurveyWindowState(round, deadline)
    expect(canEditParticipation(round, state)).toBe(false)
    expect(groupParticipationRecords([{ round }], deadline)).toEqual({ current: [], history: [{ round }] })
    expect(participationStatus(round, state)).toBe("registrationClosed")
  })

  it("keeps an upcoming or ongoing fixed event visible after registration closes without enabling edits", () => {
    const pending = { ...round, status: "closed", content_config: { eventStart: "2026-10-01T09:00:00Z", eventEnd: "2026-10-01T12:00:00Z" } }
    for (const now of [new Date("2026-09-30T12:00:00Z"), new Date("2026-10-01T10:00:00Z")]) {
      expect(groupParticipationRecords([{ round: pending }], now).current).toEqual([{ round: pending }])
      expect(canEditParticipation(pending, getSurveyWindowState(pending, now))).toBe(false)
    }
    expect(groupParticipationRecords([{ round: pending }], new Date("2026-10-02T00:00:00Z")).history).toEqual([{ round: pending }])
  })

  it("prioritizes editable entries by deadline without presenting a completed round as a successful match", () => {
    const records = [{ round: { ...round, status: "matched" } }, { round: { ...round, id: "later", survey_end: "2026-10-01T00:00:00Z" } }, { round }]
    const grouped = groupParticipationRecords(records, new Date("2026-09-29T12:00:00Z"))
    expect(grouped.current.map((record) => record.round.id)).toEqual(["round", "later"])
    expect(grouped.history).toEqual([records[0]])
    expect(participationStatus(records[0].round, "matched")).toBe("collectionComplete")
  })

  it("keeps cancelled fixed events in history and only offers registration again while open", () => {
    const cancelled_at = "2026-09-29T08:00:00Z"
    const record = { round: { ...round, content_config: { eventStart: "2026-10-01T09:00:00Z" } }, cancelled_at }
    expect(groupParticipationRecords([record], new Date("2026-09-29T12:00:00Z"))).toEqual({ current: [], history: [record] })
    expect(participationStatus(round, "open", cancelled_at)).toBe("cancelled")
    expect(participationStatus(round, "closed", cancelled_at)).toBe("cancelled")
    expect(canEditParticipation(round, "open", cancelled_at)).toBe(false)
    expect(canReregisterParticipation(round, "open", cancelled_at)).toBe(true)
    expect(canReregisterParticipation(round, "expired", cancelled_at)).toBe(false)
    expect(canReregisterParticipation(round, "scheduled", cancelled_at)).toBe(false)
    expect(participationStatus({ ...round, purpose: "matching" }, "open", cancelled_at)).toBe("submitted")
    expect(canReregisterParticipation({ ...round, purpose: "matching" }, "open", cancelled_at)).toBe(false)
  })

  it("localizes saved choice labels while retaining free text verbatim", () => {
    const config = normalizeRoundConfig({ questions: [
      { id: "choice", type: "multi", label: { zh: "选择", ja: "選択" }, options: [{ id: "a", label: { zh: "选项甲", ja: "選択肢A" } }] },
      { id: "text", type: "text", label: { zh: "备注" }, options: [] },
    ] })
    const rows = participationCustomAnswers(config, { choice: ["a"], text: "<script>text stays plain</script>" }, "ja")
    expect(rows[0]).toMatchObject({ label: "選択", values: ["選択肢A"], unavailable: false })
    expect(rows[1].values).toEqual(["<script>text stays plain</script>"])
  })

  it("keeps a visible placeholder when old questions or options no longer exist, without exposing internal IDs", () => {
    const config = normalizeRoundConfig({ questions: [{ id: "known", type: "single", label: { zh: "选择" }, options: [] }] })
    const rows = participationCustomAnswers(config, { known: "removed-option-id", "removed-question-id": "older-answer" }, "zh")
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.unavailable && row.values.length === 0)).toBe(true)
    expect(participationCustomAnswers(config, null, "zh")[0].unavailable).toBe(false)
  })

  it("normalizes legacy availability without crashing on malformed imported answers", () => {
    expect(participationAvailability({ "2026-10-02": ["晚上"], "2026-10-01": ["上午", 5, "unknown"], bad: ["上午"], "2026-10-03": "晚上" })).toEqual([
      { date: "2026-10-01", slots: ["上午"] }, { date: "2026-10-02", slots: ["晚上"] },
    ])
    expect(participationAvailability(null)).toEqual([])
  })
})
