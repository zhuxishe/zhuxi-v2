import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { RoundRecord } from "@/types/matching-round"

const mocks = vi.hoisted(() => ({ state: "open" }))
vi.mock("next-intl", () => ({ useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}` }))
vi.mock("@/lib/matching/use-survey-window", () => ({ useSurveyWindow: () => mocks.state }))
import { PlayerRoundEntry } from "./PlayerRoundEntry"

const round: RoundRecord = {
  id: "round", round_name: "活动", purpose: "registration", status: "open",
  survey_start: "2026-10-01T00:00:00Z", survey_end: "2026-10-10T00:00:00Z",
  activity_start: "2026-10-11", activity_end: "2026-10-12",
}

function render(item = round, submitted = true) {
  return renderToStaticMarkup(createElement(PlayerRoundEntry, { round: item, submitted, locale: "zh", initialNow: "2026-10-02T00:00:00Z" }))
}

describe("activity and matching entry actions", () => {
  beforeEach(() => { mocks.state = "open" })

  it("opens the record for an existing zero-question signup instead of an empty edit form", () => {
    const html = render()
    expect(html).toContain("participation.viewRecord")
    expect(html).toContain('href="/app/matches/rounds/round"')
    expect(html).not.toContain("/app/matching/survey")
  })

  it("keeps the initial signup action when no valid signup exists", () => {
    const html = render(round, false)
    expect(html).toContain("rounds.cta.registration")
    expect(html).toContain('href="/app/matching/survey?round=round"')
  })

  it("edits supplementary answers for an open registration and leaves matching edit wording unchanged", () => {
    const registration = render({ ...round, content_config: { questions: [{ id: "note", type: "text", label: { zh: "备注" } }] } })
    expect(registration).toContain("participation.editRegistration")
    expect(registration).toContain('href="/app/matching/survey?round=round"')
    expect(render({ ...round, purpose: "matching" })).toContain("rounds.edit")
  })

  it.each(["registration", "matching"])("keeps a record link after %s collection closes", (purpose) => {
    mocks.state = "expired"
    const html = render({ ...round, purpose })
    expect(html).toContain("participation.viewRecord")
    expect(html).toContain('href="/app/matches/rounds/round"')
    expect(html).not.toContain("/app/matching/survey")
    expect(render({ ...round, purpose }, false)).toContain("rounds.closedHint")
  })

  it("retains the open announcement action", () => {
    const html = render({ ...round, purpose: "announcement" }, false)
    expect(html).toContain("rounds.cta.announcement")
    expect(html).toContain('href="/app/matching/survey?round=round"')
  })
})
