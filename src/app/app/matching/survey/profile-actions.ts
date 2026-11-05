"use server"

import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerRound } from "@/lib/queries/player-rounds"
import { fetchMySubmission, fetchOpenRound } from "@/lib/queries/rounds"
import { getRoundPurpose } from "@/lib/matching/round-config"
import { getSurveyWindowState } from "@/lib/matching/survey-window"
import { fetchMyMatchingReadiness } from "@/lib/matching/readiness-server"
import { getRoundSubmissionAccess } from "@/lib/matching/round-submission-access"
import type { MatchingProfileKind } from "@/lib/matching/profile-readiness"
import { fetchRegistrationReviewGate } from "@/lib/registration-review-gate/server"
import type { RegistrationReviewBlocker } from "@/lib/registration-review-gate/types"

export type MatchingEntryCheck =
  | { state: "continue" }
  | { state: "incomplete"; roundId: string; missing: MatchingProfileKind[] }
  | { state: "reviews_required"; roundId: string; blockers: RegistrationReviewBlocker[] }
  | { state: "review_failed"; roundId: string }
  | { state: "failed" }

/** A preflight keeps the user on the originating card if they cancel the dialog. */
export async function checkMatchingEntry(roundId?: string): Promise<MatchingEntryCheck> {
  const player = await requirePlayer()
  if (roundId !== undefined && !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(roundId)) return { state: "failed" }
  try {
    const round = roundId ? await fetchPlayerRound(roundId) : await fetchOpenRound()
    // The destination page owns not-found/closed notices and announcements.
    if (!round || getRoundPurpose(round.purpose) === "announcement" || getSurveyWindowState(round) !== "open") return { state: "continue" }
    // The destination displays access errors; never ask an ineligible member
    // to complete more questionnaires before explaining why they cannot join.
    const access = await getRoundSubmissionAccess(round, player.memberId)
    if (!access.allowed) return { state: "continue" }
    if (getRoundPurpose(round.purpose) === "matching") {
      const readiness = await fetchMyMatchingReadiness()
      if (readiness.missing.length) return { state: "incomplete", roundId: round.id, missing: readiness.missing }
    }
    try {
      const existing = await fetchMySubmission(round.id, player.memberId)
      if (existing && !existing.cancelled_at) return { state: "continue" }
      // Existing active participation returns no blockers from the authenticated RPC.
      const { blockers } = await fetchRegistrationReviewGate(round.id)
      return blockers.length ? { state: "reviews_required", roundId: round.id, blockers } : { state: "continue" }
    } catch {
      return { state: "review_failed", roundId: round.id }
    }
  } catch {
    return { state: "failed" }
  }
}
