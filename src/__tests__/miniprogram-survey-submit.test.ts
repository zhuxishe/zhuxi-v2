import { describe, expect, it } from "vitest"
import { getMiniSurveyRoundError } from "../../packages/miniprogram/src/pages/survey/survey-submit"

describe("mini survey submit guard", () => {
  it("allows submit when round is open and not expired", () => {
    expect(getMiniSurveyRoundError(
      { status: "open", survey_end: "2026-04-20T00:00:00.000Z" },
      new Date("2026-04-13T00:00:00.000Z")
    )).toBeNull()
  })

  it("blocks submit when round is closed", () => {
    expect(getMiniSurveyRoundError(
      { status: "closed", survey_end: "2026-04-20T00:00:00.000Z" },
      new Date("2026-04-13T00:00:00.000Z")
    )).toBe("当前轮次已关闭")
  })

  it("blocks submit when round is expired", () => {
    expect(getMiniSurveyRoundError(
      { status: "open", survey_end: "2026-04-10T00:00:00.000Z" },
      new Date("2026-04-13T00:00:00.000Z")
    )).toBe("当前轮次已截止")
  })
})
