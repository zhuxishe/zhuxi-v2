import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PlayerParticipationDetail } from "@/types/player-participation"

const mocks = vi.hoisted(() => ({ state: "open" }))
vi.mock("next-intl", () => ({ useLocale: () => "zh", useTranslations: () => (key: string) => key }))
vi.mock("@/lib/matching/use-survey-window", () => ({ useSurveyWindow: () => mocks.state }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/app/app/matching/survey/cancellation-actions", () => ({ cancelRegistration: vi.fn() }))
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
    const withQuestions = { ...record, round: { ...record.round, content_config: { questions: [{ id: "note", type: "text", label: { zh: "备注" } }] } } }
    const open = renderToStaticMarkup(createElement(PlayerParticipationCard, { record: withQuestions, initialNow: "2026-09-29T12:00:00Z" }))
    expect(open).toContain('href="/app/matches/rounds/round"')
    expect(open).toContain('href="/app/matching/survey?round=round&amp;from=participation"')
    mocks.state = "expired"
    const closed = renderToStaticMarkup(createElement(PlayerParticipationCard, { record: withQuestions, initialNow: "2026-09-29T12:00:00Z" }))
    expect(closed).toContain('href="/app/matches/rounds/round"')
    expect(closed).not.toContain("/app/matching/survey")
    expect(closed).toContain("status.registrationClosed")
  })

  it("hides meaningless edit links on a zero-question signup while keeping cancellation and record access", () => {
    const card = renderToStaticMarkup(createElement(PlayerParticipationCard, { record, initialNow: "2026-09-29T12:00:00Z" }))
    expect(card).toContain('href="/app/matches/rounds/round"')
    expect(card).toContain("registrationConfirmed")
    expect(card).not.toContain("/app/matching/survey")
    const detail = renderToStaticMarkup(createElement(ParticipationRecordActions, { round: record.round, updatedAt: null, initialNow: "2026-09-29T12:00:00Z" }))
    expect(detail).toContain(">cancelRegistration<")
    expect(detail).toContain("registrationConfirmed")
    expect(detail).not.toContain("/app/matching/survey")
    expect(detail).not.toContain("readOnlyHint")
    expect(detail).not.toContain("cancelUnavailableHint")
  })

  it("continues to offer questionnaire editing on an open matching round", () => {
    const html = renderToStaticMarkup(createElement(PlayerParticipationCard, {
      record: { ...record, round: { ...record.round, purpose: "matching" } }, initialNow: "2026-09-29T12:00:00Z",
    }))
    expect(html).toContain("editSurvey")
    expect(html).toContain('href="/app/matching/survey?round=round&amp;from=participation"')
  })

  it("shows cancellation and replaces editing with registration again, retaining the record after deadline", () => {
    const cancelledRecord = { ...record, cancelled_at: "2026-09-29T08:00:00Z" }
    const open = renderToStaticMarkup(createElement(PlayerParticipationCard, { record: cancelledRecord, initialNow: "2026-09-29T12:00:00Z" }))
    expect(open).toContain("status.cancelled")
    expect(open).toContain("cancelledAt")
    expect(open).toContain("reregister")
    expect(open).not.toContain("editRegistration")
    mocks.state = "expired"
    const closed = renderToStaticMarkup(createElement(PlayerParticipationCard, { record: cancelledRecord, initialNow: "2026-09-30T00:00:00Z" }))
    expect(closed).toContain("status.cancelled")
    expect(closed).toContain('href="/app/matches/rounds/round"')
    expect(closed).not.toContain("/app/matching/survey")
  })

  it("renders matched records as read-only and explains that questionnaire submission is not attendance", () => {
    mocks.state = "matched"
    const html = renderToStaticMarkup(createElement(ParticipationRecordActions, { round: { ...record.round, purpose: "matching", status: "matched" }, updatedAt: null, initialNow: "2026-10-01T00:00:00Z" }))
    expect(html).not.toContain("/app/matching/survey")
    expect(html).toContain("readOnlyHint")
    expect(html).toContain("matchingHint")
    expect(html).toContain("status.collectionComplete")
  })

  it("shows cancellation in the detail and offers registration again instead of modify or cancel", () => {
    const html = renderToStaticMarkup(createElement(ParticipationRecordActions, {
      round: record.round, initialNow: "2026-09-29T12:00:00Z", cancelledAt: "2026-09-29T08:00:00Z", updatedAt: null,
    }))
    expect(html).toContain("status.cancelled")
    expect(html).toContain('href="/app/matching/survey?round=round&amp;from=participation"')
    expect(html).toContain(">reregister<")
    expect(html).not.toContain("editRegistration")
    expect(html).not.toContain(">cancelRegistration<")
  })

  it("limits the cancel control to active registration while the collection window remains open", () => {
    const props = { round: record.round, initialNow: "2026-09-29T12:00:00Z", updatedAt: null }
    const active = renderToStaticMarkup(createElement(ParticipationRecordActions, props))
    expect(active).toContain(">cancelRegistration<")
    mocks.state = "expired"
    const closed = renderToStaticMarkup(createElement(ParticipationRecordActions, props))
    expect(closed).not.toContain(">cancelRegistration<")
    expect(closed).not.toContain("/app/matching/survey")
    expect(closed).toContain("cancelUnavailableHint")
    mocks.state = "open"
    const matching = renderToStaticMarkup(createElement(ParticipationRecordActions, { ...props, round: { ...record.round, purpose: "matching" } }))
    expect(matching).not.toContain(">cancelRegistration<")
  })

  it("does not offer registration again from a cancelled detail after deadline", () => {
    mocks.state = "expired"
    const html = renderToStaticMarkup(createElement(ParticipationRecordActions, {
      round: record.round, initialNow: "2026-09-30T00:00:00Z", cancelledAt: "2026-09-29T08:00:00Z", updatedAt: null,
    }))
    expect(html).toContain("status.cancelled")
    expect(html).not.toContain("/app/matching/survey")
    expect(html).not.toContain(">cancelRegistration<")
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
