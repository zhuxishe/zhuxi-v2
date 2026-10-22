import { describe, expect, it } from "vitest"
import { buildMatchingCompletionHref, buildMatchingQuestionnaireHref, buildMatchingSurveyHref, matchingCompletionDestination, parseMatchingCompletionContext } from "./completion-flow"
import type { MatchingReadiness } from "./profile-readiness"

const roundId = "1731d454-c4e9-49f6-8c6c-1cb7ce8ee4db"
const context = { roundId, fromParticipation: true }
function readiness(supplementary: boolean, personality: boolean, quiz: boolean): MatchingReadiness {
  const result = { supplementary, personality, quiz, missing: [] } as MatchingReadiness
  result.missing = (["supplementary", "personality", "quiz"] as const).filter((kind) => !result[kind])
  return result
}

describe("matching questionnaire completion flow", () => {
  it("preserves the same round and participation source through every step", () => {
    expect(buildMatchingCompletionHref(context)).toBe(`/app/profile/complete?round=${roundId}&from=participation`)
    for (const kind of ["supplementary", "personality", "quiz"] as const) {
      const href = buildMatchingQuestionnaireHref(kind, context)
      const params = Object.fromEntries(new URL(href, "https://example.test").searchParams)
      expect(parseMatchingCompletionContext(params)).toEqual(context)
    }
    expect(buildMatchingSurveyHref(context)).toBe(`/app/matching/survey?round=${roundId}&from=participation`)
  })

  it.each([
    [false, false, false, "supplementary"], [false, true, false, "supplementary"],
    [false, false, true, "supplementary"], [false, true, true, "supplementary"],
    [true, false, false, "personality"], [true, false, true, "personality"],
    [true, true, false, "quiz"], [true, true, true, null],
  ] as const)("resumes %s/%s/%s at the first unfinished step %s", (supplementary, personality, quiz, next) => {
    expect(matchingCompletionDestination(readiness(supplementary, personality, quiz), context))
      .toBe(next ? buildMatchingQuestionnaireHref(next, context) : buildMatchingSurveyHref(context))
  })

  it("never converts an arbitrary return URL or multi-value query into a redirect", () => {
    for (const params of [{}, { round: "https://untrusted.test" }, { round: [roundId, roundId] }, { matchingRound: "//untrusted.test", round: roundId }]) {
      expect(parseMatchingCompletionContext(params)).toBeNull()
    }
    expect(parseMatchingCompletionContext({ round: roundId, from: "https://untrusted.test", returnTo: "https://untrusted.test" }))
      .toEqual({ roundId, fromParticipation: false })
    expect(() => buildMatchingCompletionHref({ roundId: "../other", fromParticipation: false })).toThrow()
  })

  it("returns to the survey, never the success page or an automatic registration endpoint", () => {
    expect(matchingCompletionDestination(readiness(true, true, true), { roundId, fromParticipation: false }))
      .toBe(`/app/matching/survey?round=${roundId}`)
  })
})
