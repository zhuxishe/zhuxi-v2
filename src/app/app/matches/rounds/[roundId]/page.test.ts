import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ player: vi.fn(), detail: vi.fn(), redirect: vi.fn(), notFound: vi.fn() }))
vi.mock("@/lib/auth/player", () => ({ requirePlayer: mocks.player }))
vi.mock("@/lib/queries/player-participation", () => ({ fetchPlayerParticipationDetail: mocks.detail }))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock("next-intl/server", () => ({ getLocale: async () => "zh", getTranslations: async () => (key: string) => key }))
import ParticipationRecordPage from "./page"
import LegacyParticipationRecordPage from "@/app/app/profile/stats/rounds/[roundId]/page"

const roundId = "429eea31-9986-42a8-b2b9-67f792e07173"
const params = Promise.resolve({ roundId })

function hrefs(node: ReactNode): string[] {
  if (Array.isArray(node)) return node.flatMap(hrefs)
  if (!isValidElement<{ href?: string; children?: ReactNode }>(node)) return []
  return [...(node.props.href ? [node.props.href] : []), ...hrefs(node.props.children)]
}

describe("participation detail route migration", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.player.mockResolvedValue({ memberId: "own-member" })
    mocks.detail.mockResolvedValue({ round: { id: roundId, round_name: "活动", purpose: "registration", survey_end: "2026-10-01T00:00:00Z" } })
    mocks.redirect.mockImplementation((href: string) => { throw new Error(`redirect:${href}`) })
    mocks.notFound.mockImplementation(() => { throw new Error("notFound") })
  })

  it("checks ownership before redirecting an old saved record link to the same record", async () => {
    await expect(LegacyParticipationRecordPage({ params })).rejects.toThrow(`redirect:/app/matches/rounds/${roundId}`)
    expect(mocks.player).toHaveBeenCalledOnce()
    expect(mocks.detail).toHaveBeenCalledWith("own-member", roundId)
  })

  it.each(["another-members-round", "invalid/id"])("keeps missing or invalid old records unavailable: %s", async (id) => {
    mocks.detail.mockResolvedValue(null)
    await expect(LegacyParticipationRecordPage({ params: Promise.resolve({ roundId: id }) })).rejects.toThrow("notFound")
    expect(mocks.detail).toHaveBeenCalledWith("own-member", id)
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it("uses the same owned-record lookup at the new route and returns to the participation section", async () => {
    expect(hrefs(await ParticipationRecordPage({ params }))).toContain("/app/matches#participation")
    expect(mocks.detail).toHaveBeenCalledWith("own-member", roundId)
    mocks.detail.mockResolvedValue(null)
    await expect(ParticipationRecordPage({ params })).rejects.toThrow("notFound")
  })

  it("does not look up a record or redirect when player authentication fails", async () => {
    mocks.player.mockRejectedValue(new Error("unauthorized"))
    await expect(LegacyParticipationRecordPage({ params })).rejects.toThrow("unauthorized")
    expect(mocks.detail).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
