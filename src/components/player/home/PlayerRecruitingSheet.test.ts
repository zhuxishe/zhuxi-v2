import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { PlayerHomeRoundItem } from "./types"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => children,
  DialogContent: ({ children }: { children: React.ReactNode }) => children,
  DialogDescription: ({ children }: { children: React.ReactNode }) => children,
  DialogTitle: ({ children }: { children: React.ReactNode }) => children,
}))
import { PlayerRecruitingSheet } from "./PlayerRecruitingSheet"

const now = "2026-09-29T01:00:00Z"
const round: PlayerHomeRoundItem = {
  id: "round-1", title: "Autumn welcome", purpose: "registration", submitted: false,
  status: "open", survey_start: "2026-09-29T00:00:00Z", survey_end: "2026-09-30T00:00:00Z", eventStart: "", location: "",
}
const labels = {
  title: "recruiting", description: "open opportunities", empty: "nothing available", viewAll: "large activities",
  roundsTitle: "participation", announcementsTitle: "notices", activitiesTitle: "upcoming", viewRounds: "browse rounds",
  datePending: "date pending", locationPending: "location pending", close: "close",
}
function render(rounds: PlayerHomeRoundItem[], includeActivity = false) {
  return renderToStaticMarkup(createElement(PlayerRecruitingSheet, {
    rounds, initialNow: now, locale: "zh", labels, onClose: vi.fn(),
    activities: includeActivity ? [{ id: "large-1", title: "Large activity", coverUrl: null, startAt: null, eventDate: null, location: null }] : [],
  }))
}

describe("homepage recruiting entry destinations", () => {
  it("shows an open questionnaire even when there are no large activities", () => {
    const html = render([{ ...round, purpose: "matching" }])
    expect(html).toContain("Autumn welcome")
    expect(html).toContain('href="/app/matching/survey?round=round-1"')
    expect(html).toContain("cta.matching")
    expect(html).not.toContain(labels.empty)
  })

  it("takes submitted users to their persistent record instead of an expiring edit URL", () => {
    const html = render([{ ...round, submitted: true }])
    expect(html).toContain('href="/app/profile/stats/rounds/round-1"')
    expect(html).toContain("registered")
    expect(html).toContain("viewRecord")
  })

  it("keeps announcements distinct from registration and preserves large activity links", () => {
    const html = render([{ ...round, purpose: "announcement", submitted: true }], true)
    expect(html).toContain('id="recruiting-announcements-title"')
    expect(html).not.toContain('id="recruiting-rounds-title"')
    expect(html).toContain("cta.announcement")
    expect(html).not.toContain("/app/profile/stats/rounds/")
    expect(html).toContain('href="/app/scripts/large/large-1"')
    expect(html).toContain('href="/app/scripts/large"')
  })

  it("excludes closed, not-yet-open, and exactly expired questionnaires", () => {
    const html = render([
      { ...round, id: "expired", survey_end: now },
      { ...round, id: "future", survey_start: "2026-09-29T02:00:00Z" },
      { ...round, id: "closed", status: "closed" },
    ])
    expect(html).toContain(labels.empty)
    expect(html).not.toContain("Autumn welcome")
    expect(html).not.toContain("/app/matching/survey?round=")
  })
})
