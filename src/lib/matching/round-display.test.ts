import { describe, expect, it } from "vitest"
import type { RoundRecord } from "@/types/matching-round"
import { roundCardCopy, roundDisplayName, roundHref, selectHomeRound } from "./round-display"

const round: RoundRecord = {
  id: "round", round_name: "10月匹配", status: "open", survey_start: "2026-09-29T00:00:00Z", survey_end: "2026-09-30T00:00:00Z",
  activity_start: "2026-10-10", activity_end: "2026-10-11",
}
const defaults = { title: "新一期匹配问卷已开放", description: "填写偏好", cta: "填写问卷" }

describe("matching management player entry display", () => {
  it("preserves old matching card wording when there is no content configuration", () => {
    expect(roundCardCopy(round, "zh", defaults)).toEqual(defaults)
    expect(roundDisplayName(round, "ja")).toBe(round.round_name)
  })

  it("uses the event name instead of the generic matching heading for registration and announcements", () => {
    for (const purpose of ["registration", "announcement"]) {
      expect(roundCardCopy({ ...round, purpose }, "zh", defaults).title).toBe(round.round_name)
    }
  })

  it("uses bilingual custom copy and falls back to the other available language", () => {
    const entry = { ...round, content_config: {
      titleJa: "秋の歓迎会", cardTitle: { zh: "秋季迎新", ja: "歓迎会の受付" },
      cardDescription: { zh: "中文介绍", ja: "" }, cardCta: { zh: "我要参加", ja: "参加する" },
    } }
    expect(roundCardCopy(entry, "ja", defaults)).toEqual({ title: "歓迎会の受付", description: "中文介绍", cta: "参加する" })
    expect(roundDisplayName(entry, "ja")).toBe("秋の歓迎会")
  })

  it("falls back from a blank card description to the configured introduction", () => {
    expect(roundCardCopy({ ...round, content_config: { introduction: { zh: "活动内容", ja: "" } } }, "zh", defaults).description).toBe("活动内容")
  })

  it("prioritizes pending participation before notices and existing submissions", () => {
    const entries = [{ ...round, id: "submitted" }, { ...round, id: "notice", purpose: "announcement" },
      { ...round, id: "registration", purpose: "registration", survey_end: "2026-10-01T00:00:00Z" }]
    expect(selectHomeRound(entries, ["submitted"])?.id).toBe("registration")
    expect(selectHomeRound(entries.slice(0, 2), ["submitted"])?.id).toBe("notice")
    expect(entries.map((entry) => entry.id)).toEqual(["submitted", "notice", "registration"])
  })

  it("selects the soonest deadline within each priority and handles empty lists", () => {
    expect(selectHomeRound([{ ...round, id: "later", survey_end: "2026-10-01T00:00:00Z" }, round], [])?.id).toBe("round")
    expect(selectHomeRound([], [])).toBeNull()
  })

  it("keeps an explicit encoded round identity in the entry URL", () => {
    expect(roundHref("id&round=other")).toBe("/app/matching/survey?round=id%26round%3Dother")
  })
})
