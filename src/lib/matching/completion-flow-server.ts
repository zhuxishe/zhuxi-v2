import { redirect } from "next/navigation"
import type { MatchingProfileKind } from "./profile-readiness"
import { fetchMyMatchingReadiness } from "./readiness-server"
import { buildMatchingQuestionnaireHref, matchingCompletionDestination, parseMatchingCompletionContext, type CompletionSearchParams } from "./completion-flow"

/** Resuming a saved link cannot reopen completed steps or skip earlier missing questionnaires. */
export async function matchingQuestionnaireContext(kind: MatchingProfileKind, searchParams: CompletionSearchParams) {
  const context = parseMatchingCompletionContext(searchParams)
  if (!context) return null
  const destination = matchingCompletionDestination(await fetchMyMatchingReadiness(), context)
  if (destination !== buildMatchingQuestionnaireHref(kind, context)) redirect(destination)
  return context
}
