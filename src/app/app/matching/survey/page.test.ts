import { isValidElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ player: vi.fn(), round: vi.fn(), submission: vi.fn(), redirect: vi.fn() }))
vi.mock("@/lib/auth/player", () => ({ requirePlayer: mocks.player }))
vi.mock("@/lib/queries/player-rounds", () => ({ fetchPlayerRound: mocks.round }))
vi.mock("@/lib/queries/rounds", () => ({ fetchMySubmission: mocks.submission, fetchOpenRound: mocks.round, fetchLatestRound: mocks.round }))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))
vi.mock("@/components/player/SurveyForm", () => ({ SurveyForm: "survey-form" }))
import SurveyPage from "./page"
import SurveySuccessPage from "./success/page"

type NodeProps = { href?: string; children?: ReactNode; fromParticipation?: boolean; existing?: { cancelled_at?: string | null; updated_at?: string | null; custom_answers?: unknown } | null }
function nodes(node: ReactNode): NodeProps[] {
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (!isValidElement<NodeProps>(node)) return []
  return [node.props, ...nodes(node.props.children)]
}
const hrefs = (node: ReactNode) => nodes(node).flatMap((props) => props.href ? [props.href] : [])
const roundId = "429eea31-9986-42a8-b2b9-67f792e07173"
const recordHref = `/app/matches/rounds/${roundId}`
const editHref = `/app/matching/survey?round=${roundId}`
const round = { id: roundId, status: "open", purpose: "registration", survey_start: "2026-09-29T00:00:00Z", survey_end: "2026-10-01T00:00:00Z" }

describe("survey participation navigation", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime("2026-09-30T00:00:00Z")
    mocks.player.mockResolvedValue({ memberId: "own-member" })
    mocks.round.mockResolvedValue(round)
    mocks.submission.mockResolvedValue({ id: "own-submission", availability: {} })
    mocks.redirect.mockImplementation((href: string) => { throw new Error(`redirect:${href}`) })
  })
  afterEach(() => vi.useRealTimers())

  it("returns a record edit to its owned record and preserves the fixed source for submission", async () => {
    const page = await SurveyPage({ searchParams: Promise.resolve({ round: roundId, from: "participation" }) })
    expect(hrefs(page)).toEqual([recordHref])
    expect(nodes(page).find((props) => props.fromParticipation !== undefined)?.fromParticipation).toBe(true)
    expect(mocks.submission).toHaveBeenCalledWith(roundId, "own-member")
  })

  it("passes saved answers and cancellation version to the form without losing the record return link", async () => {
    const cancelledAt = "2026-09-29T08:00:00Z"
    const updatedAt = "2026-09-29T08:00:01Z"
    mocks.submission.mockResolvedValue({ id: "own-submission", availability: {}, cancelled_at: cancelledAt, updated_at: updatedAt, custom_answers: { food: "veg" } })
    const page = await SurveyPage({ searchParams: Promise.resolve({ round: roundId, from: "participation" }) })
    expect(hrefs(page)).toEqual([recordHref])
    expect(nodes(page).find((props) => props.fromParticipation !== undefined)).toMatchObject({
      fromParticipation: true, existing: { cancelled_at: cancelledAt, updated_at: updatedAt, custom_answers: { food: "veg" } },
    })
  })

  it.each([undefined, "https://outside.example/", ["participation", "https://outside.example/"]])("ignores unknown or duplicate sources: %s", async (from) => {
    const page = await SurveyPage({ searchParams: Promise.resolve({ round: roundId, from }) })
    expect(hrefs(page)).toEqual(["/app"])
    expect(nodes(page).find((props) => props.fromParticipation !== undefined)?.fromParticipation).toBe(false)
  })

  it("does not offer a return to a record that the player has not submitted", async () => {
    mocks.submission.mockResolvedValue(null)
    const page = await SurveyPage({ searchParams: Promise.resolve({ round: roundId, from: "participation" }) })
    expect(hrefs(page)).toEqual(["/app"])
  })

  it("still returns to the saved record if the questionnaire closes before the edit page opens", async () => {
    mocks.round.mockResolvedValue({ ...round, status: "closed" })
    const page = await SurveyPage({ searchParams: Promise.resolve({ round: roundId, from: "participation" }) })
    expect(hrefs(page)).toEqual([recordHref])
    expect(nodes(page).some((props) => props.fromParticipation !== undefined)).toBe(false)
  })

  it("links success to the exact record and keeps the edit source", async () => {
    const page = await SurveySuccessPage({ searchParams: Promise.resolve({ roundId, from: "participation" }) })
    expect(hrefs(page)).toEqual([recordHref, `${editHref}&from=participation`, "/app"])
  })

  it.each(["https://outside.example/", ["participation", "participation"]])("does not reuse an arbitrary success-page source: %s", async (from) => {
    const page = await SurveySuccessPage({ searchParams: Promise.resolve({ roundId, from }) })
    expect(hrefs(page)).toEqual([recordHref, editHref, "/app"])
  })

  it("retains view-record on success after closure without restoring the edit action", async () => {
    mocks.round.mockResolvedValue({ ...round, status: "closed" })
    expect(hrefs(await SurveySuccessPage({ searchParams: Promise.resolve({ roundId }) }))).toEqual([recordHref, "/app"])
  })

  it("redirects an old success URL to the saved cancellation record", async () => {
    mocks.submission.mockResolvedValue({ id: "own-submission", cancelled_at: "2026-09-29T08:00:00Z" })
    await expect(SurveySuccessPage({ searchParams: Promise.resolve({ roundId }) })).rejects.toThrow(`redirect:${recordHref}`)
  })

  it("does not show a success record when the current player has not submitted", async () => {
    mocks.submission.mockResolvedValue(null)
    await expect(SurveySuccessPage({ searchParams: Promise.resolve({ roundId }) })).rejects.toThrow(`redirect:${editHref}`)
  })
})
