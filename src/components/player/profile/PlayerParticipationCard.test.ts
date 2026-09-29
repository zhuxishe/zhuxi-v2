import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PlayerParticipationDetail } from "@/types/player-participation"

const mocks = vi.hoisted(() => ({ state: "open" }))
vi.mock("next-intl", () => ({ useLocale: () => "zh", useTranslations: () => (key: string) => key }))
vi.mock("@/lib/matching/use-survey-window", () => ({ useSurveyWindow: () => mocks.state }))
import { PlayerParticipationCard } from "./PlayerParticipationCard"
import { ParticipationRecordActions } from "./ParticipationRecordActions"
import { ParticipationAnswers } from "./ParticipationAnswers"

const record: PlayerParticipationDetail = {
  id: "record", created_at: "2026-09-29T00:00:00Z", updated_at: null,
  game_type_pref: "都可以", gender_pref: "都可以", availability: {}, interest_tags: [], social_style: null, message: null, custom_answers: {},
  round: { id: "round", round_name: "报名活动", purpose: "registration", status: "open", survey_start: "2026-09-29T00:00:00Z", survey_end: "2026-09-30T00:00:00Z", activity_start: "2026-10-01", activity_end: "2026-10-02" },
}

describe("participation record controls", () => {
  beforeEach(() => { mocks.state = "open" })

  it("keeps a permanent record link and offers a separate edit action only during collection", () => {
    const open = renderToStaticMarkup(createElement(PlayerParticipationCard, { record, initialNow: "2026-09-29T12:00:00Z" }))
    expect(open).toContain('href="/app/matches/rounds/round"')
    expect(open).toContain('href="/app/matching/survey?round=round&amp;from=participation"')
    mocks.state = "expired"
    const closed = renderToStaticMarkup(createElement(PlayerParticipationCard, { record, initialNow: "2026-09-29T12:00:00Z" }))
    expect(closed).toContain('href="/app/matches/rounds/round"')
    expect(closed).not.toContain("/app/matching/survey")
    expect(closed).toContain("status.registrationClosed")
  })

  it("renders matched records as read-only and explains that questionnaire submission is not attendance", () => {
    mocks.state = "matched"
    const html = renderToStaticMarkup(createElement(ParticipationRecordActions, { round: { ...record.round, purpose: "matching", status: "matched" }, initialNow: "2026-10-01T00:00:00Z" }))
    expect(html).not.toContain("/app/matching/survey")
    expect(html).toContain("readOnlyHint")
    expect(html).toContain("matchingHint")
    expect(html).toContain("status.collectionComplete")
  })

  it("escapes saved text and does not expose meaningless matching defaults on registration records", () => {
    const html = renderToStaticMarkup(createElement(ParticipationAnswers, { record: {
      ...record,
      custom_answers: { comment: "<script>alert(1)</script>" },
      round: { ...record.round, content_config: { questions: [{ id: "comment", type: "text", label: { zh: "备注" }, options: [] }] } },
    } }))
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("gameType.title")
    expect(html).not.toContain("timeSlots.title")
  })
})
