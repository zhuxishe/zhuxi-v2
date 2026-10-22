import { describe, expect, it } from "vitest"
import { canRunRoundMatching, canUpdateRoundStatus } from "@/components/admin/round-detail-rules"
import { getSurveyWindowState, surveySubmissionError } from "@/lib/matching/survey-window"

describe("canRunRoundMatching", () => {
  it("keeps draft and matched rounds unavailable and preserves closed matching", () => {
    expect(canRunRoundMatching("draft")).toBe(false)
    expect(canRunRoundMatching("open")).toBe(false)
    expect(canRunRoundMatching("closed")).toBe(true)
    expect(canRunRoundMatching("matched")).toBe(false)
  })

  it.each([
    ["scheduled", false], ["open", true], ["expired", true], ["invalid", false],
  ])("allows an open round in window state %s: %s", (windowState, allowed) => {
    expect(canRunRoundMatching("open", windowState)).toBe(allowed)
  })

  it("permits matching from the opening instant without extending the submission deadline", () => {
    const round = { status: "open", survey_start: "2026-10-23T09:00:00+09:00", survey_end: "2026-10-25T18:00:00+09:00" }
    for (const [now, matching, submission] of [
      ["2026-10-23T08:59:59.999+09:00", false, "surveyNotStarted"],
      [round.survey_start, true, null],
      ["2026-10-25T17:59:59.999+09:00", true, null],
      [round.survey_end, true, "surveyExpired"],
    ] as const) {
      const date = new Date(now)
      expect(canRunRoundMatching(round.status, getSurveyWindowState(round, date))).toBe(matching)
      expect(surveySubmissionError(round, date)).toBe(submission)
    }
  })
})

describe("canUpdateRoundStatus", () => {
  it("prevents matched rounds from being downgraded or manually set", () => {
    expect(canUpdateRoundStatus("draft", "open")).toBe(true)
    expect(canUpdateRoundStatus("open", "closed")).toBe(true)
    expect(canUpdateRoundStatus("closed", "draft")).toBe(true)
    expect(canUpdateRoundStatus("closed", "open")).toBe(true)
    expect(canUpdateRoundStatus("unknown", "open")).toBe(false)
    expect(canUpdateRoundStatus("closed", "matched")).toBe(false)
    expect(canUpdateRoundStatus("matched", "draft")).toBe(false)
    expect(canUpdateRoundStatus("matched", "open")).toBe(false)
    expect(canUpdateRoundStatus("matched", "closed")).toBe(false)
  })
})
