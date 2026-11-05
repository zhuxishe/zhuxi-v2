import { isRegistrationReviewHref, REVIEW_GATE_UUID, type RegistrationReviewBlocker } from "./types"

export interface RegistrationReturnContext {
  roundId: string
  fromParticipation: boolean
}

export function parseRegistrationReturnContext(params: Record<string, string | string[] | undefined>): RegistrationReturnContext | null {
  if (typeof params.returnRound !== "string" || !REVIEW_GATE_UUID.test(params.returnRound)) return null
  return { roundId: params.returnRound, fromParticipation: params.from === "participation" }
}

export function registrationReturnHref(context: RegistrationReturnContext) {
  if (!REVIEW_GATE_UUID.test(context.roundId)) throw new Error("Invalid registration target")
  const query = new URLSearchParams({ round: context.roundId })
  if (context.fromParticipation) query.set("from", "participation")
  return `/app/matching/survey?${query}`
}

export function registrationReviewHref(blocker: RegistrationReviewBlocker, context: RegistrationReturnContext) {
  if (!REVIEW_GATE_UUID.test(context.roundId)
    || !isRegistrationReviewHref(blocker.review_href, blocker.purpose, blocker.round_id)) throw new Error("Invalid review destination")
  const query = new URLSearchParams({ returnRound: context.roundId })
  if (context.fromParticipation) query.set("from", "participation")
  return `${blocker.review_href}?${query}`
}
