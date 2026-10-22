import type { MatchingProfileKind, MatchingReadiness } from "./profile-readiness"

export interface MatchingCompletionContext {
  roundId: string
  fromParticipation: boolean
}

export type CompletionSearchParams = Record<string, string | string[] | undefined>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Only carry an internal round ID and the known participation origin; never a return URL. */
export function parseMatchingCompletionContext(searchParams: CompletionSearchParams): MatchingCompletionContext | null {
  const roundId = searchParams.matchingRound ?? searchParams.round
  if (typeof roundId !== "string" || !UUID.test(roundId)) return null
  return { roundId, fromParticipation: searchParams.from === "participation" }
}

function query(context: MatchingCompletionContext, key: "round" | "matchingRound") {
  if (!UUID.test(context.roundId)) throw new Error("Invalid matching round")
  const params = new URLSearchParams({ [key]: context.roundId })
  if (context.fromParticipation) params.set("from", "participation")
  return params.toString()
}

export function buildMatchingCompletionHref(context: MatchingCompletionContext) {
  return `/app/profile/complete?${query(context, "round")}`
}

export function buildMatchingQuestionnaireHref(kind: MatchingProfileKind, context: MatchingCompletionContext) {
  return `/app/profile/${kind}?${query(context, "matchingRound")}`
}

export function buildMatchingSurveyHref(context: MatchingCompletionContext) {
  return `/app/matching/survey?${query(context, "round")}`
}

/** Always use the canonical order, including after a refresh or another tab saves a questionnaire. */
export function matchingCompletionDestination(readiness: MatchingReadiness, context: MatchingCompletionContext) {
  const next = (["supplementary", "personality", "quiz"] as const).find((kind) => !readiness[kind])
  return next ? buildMatchingQuestionnaireHref(next, context) : buildMatchingSurveyHref(context)
}
