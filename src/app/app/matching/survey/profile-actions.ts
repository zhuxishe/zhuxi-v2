"use server"

import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerRound } from "@/lib/queries/player-rounds"
import { fetchOpenRound } from "@/lib/queries/rounds"
import { getRoundPurpose } from "@/lib/matching/round-config"
import { getSurveyWindowState } from "@/lib/matching/survey-window"
import { fetchMyMatchingReadiness } from "@/lib/matching/readiness-server"
import type { MatchingProfileKind } from "@/lib/matching/profile-readiness"

export type MatchingEntryCheck =
  | { state: "continue" }
  | { state: "incomplete"; roundId: string; missing: MatchingProfileKind[] }
  | { state: "failed" }

/** A preflight keeps the user on the originating card if they cancel the dialog. */
export async function checkMatchingEntry(roundId?: string): Promise<MatchingEntryCheck> {
  await requirePlayer()
  if (roundId !== undefined && !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(roundId)) return { state: "failed" }
  try {
    const round = roundId ? await fetchPlayerRound(roundId) : await fetchOpenRound()
    // The destination page owns not-found/closed notices and non-matching registration.
    if (!round || getRoundPurpose(round.purpose) !== "matching" || getSurveyWindowState(round) !== "open") return { state: "continue" }
    const readiness = await fetchMyMatchingReadiness()
    return readiness.missing.length ? { state: "incomplete", roundId: round.id, missing: readiness.missing } : { state: "continue" }
  } catch {
    return { state: "failed" }
  }
}
