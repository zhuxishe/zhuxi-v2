import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ player: vi.fn(), headers: vi.fn(), redirect: vi.fn() }))
vi.mock("@/lib/auth/player", () => ({ getPlayerInfo: mocks.player }))
vi.mock("next/headers", () => ({ headers: mocks.headers }))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/components/player/PreInterviewForm", () => ({ PreInterviewForm: () => null }))

import HomePage from "@/app/app/page"
import InterviewFormPage from "@/app/app/interview-form/page"
import InactivePage from "@/app/app/inactive/page"

beforeEach(() => {
  vi.resetAllMocks()
  mocks.player.mockResolvedValue(null)
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`) })
})

describe("page-level login routing agrees with the Player layout", () => {
  it.each([
    ["/app?tab=matches", HomePage],
    ["/app/interview-form?from=matching", InterviewFormPage],
    ["/app/inactive", InactivePage],
  ] as const)("keeps %s when the child page resolves before the layout", async (next, page) => {
    mocks.headers.mockResolvedValue(new Headers({ "x-player-return-path": next, "x-player-had-session": "1" }))
    await expect(page()).rejects.toThrow(`redirect:/login?next=${encodeURIComponent(next)}&reason=session_expired`)
    expect(mocks.redirect).toHaveBeenCalledOnce()
  })
})
