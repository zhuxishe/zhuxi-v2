import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ readiness: vi.fn(), redirect: vi.fn() }))
vi.mock("./readiness-server", () => ({ fetchMyMatchingReadiness: mocks.readiness }))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
import { matchingQuestionnaireContext } from "./completion-flow-server"

const roundId = "1731d454-c4e9-49f6-8c6c-1cb7ce8ee4db"
beforeEach(() => {
  vi.clearAllMocks()
  mocks.redirect.mockImplementation((href: string) => { throw new Error(`REDIRECT:${href}`) })
})

describe("server-side questionnaire resumption", () => {
  it("leaves independent profile visits unchanged", async () => {
    expect(await matchingQuestionnaireContext("supplementary", {})).toBeNull()
    expect(mocks.readiness).not.toHaveBeenCalled()
  })
  it("allows the first missing step with its return context", async () => {
    mocks.readiness.mockResolvedValue({ supplementary: true, personality: false, quiz: false, missing: ["personality", "quiz"] })
    expect(await matchingQuestionnaireContext("personality", { matchingRound: roundId, from: "participation" }))
      .toEqual({ roundId, fromParticipation: true })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
  it("skips a completed step reopened from history or another tab", async () => {
    mocks.readiness.mockResolvedValue({ supplementary: true, personality: true, quiz: false, missing: ["quiz"] })
    await expect(matchingQuestionnaireContext("supplementary", { matchingRound: roundId }))
      .rejects.toThrow(`REDIRECT:/app/profile/quiz?matchingRound=${roundId}`)
  })
  it("cannot skip an earlier missing questionnaire through a direct URL", async () => {
    mocks.readiness.mockResolvedValue({ supplementary: false, personality: true, quiz: false, missing: ["supplementary", "quiz"] })
    await expect(matchingQuestionnaireContext("quiz", { matchingRound: roundId }))
      .rejects.toThrow(`REDIRECT:/app/profile/supplementary?matchingRound=${roundId}`)
  })
  it("returns to the original round when all results are valid, including an interrupted retake", async () => {
    mocks.readiness.mockResolvedValue({ supplementary: true, personality: true, quiz: true, missing: [] })
    await expect(matchingQuestionnaireContext("quiz", { matchingRound: roundId, from: "participation" }))
      .rejects.toThrow(`REDIRECT:/app/matching/survey?round=${roundId}&from=participation`)
  })
  it("does not guess completeness or redirect to registration after a read failure", async () => {
    mocks.readiness.mockRejectedValue(new Error("database unavailable"))
    await expect(matchingQuestionnaireContext("quiz", { matchingRound: roundId })).rejects.toThrow("database unavailable")
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
