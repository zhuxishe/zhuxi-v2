import { describe, expect, it } from "vitest"
import { buildMiniRoundCardState } from "../../packages/miniprogram/src/lib/round-state"

describe("mini round state helpers", () => {
  it("builds open round card state from round and submission presence", () => {
    expect(buildMiniRoundCardState(
      { id: "r1", round_name: "四月轮次", survey_end: "2026-04-20" },
      true
    )).toEqual({
      title: "当前匹配轮次",
      roundName: "四月轮次",
      statusText: "已提交 — 点击修改",
      statusTone: "done",
      deadlineText: "截止: 2026-04-20",
      canOpenSurvey: true,
    })
  })

  it("returns null when no open round exists", () => {
    expect(buildMiniRoundCardState(null, false)).toBeNull()
  })
})
