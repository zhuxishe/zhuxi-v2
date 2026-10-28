import { cache } from "react"
import { createClient } from "@/lib/supabase/server"

export interface RoundSubmissionScope {
  id: string
  is_test?: boolean | null
}

export type RoundParticipationError = "roundParticipationNotAllowed" | "roundParticipationCheckFailed"
export type RoundSubmissionAccess = { allowed: true } | { allowed: false; error: RoundParticipationError }

// React cache is scoped to the server request, never shared between users.
// memberId must come from requirePlayer(), not a submitted form field.
const readMemberIsTest = cache(async (memberId: string): Promise<boolean> => {
  const db = await createClient()
  const { data, error } = await db.from("members").select("is_test").eq("id", memberId).maybeSingle()
  if (error || typeof data?.is_test !== "boolean") throw new Error("Unable to check member participation scope")
  return data.is_test
})

const readMyTestRoundIds = cache(async (): Promise<Set<string>> => {
  const db = await createClient()
  const { data, error } = await db.rpc("get_my_test_round_ids")
  if (error || !Array.isArray(data) || data.some((id) => typeof id !== "string" || id.length === 0)) {
    throw new Error("Unable to check test round participation")
  }
  return new Set(data)
})

/** Read visibility (including admin visibility) does not grant participation. */
export async function filterSubmittableRounds<T extends RoundSubmissionScope>(
  rounds: T[], memberId: string,
): Promise<{ rounds: T[]; error: "roundParticipationCheckFailed" | null }> {
  if (rounds.length === 0) return { rounds: [], error: null }
  if (!memberId || rounds.some((round) => !round.id || typeof round.is_test !== "boolean")) {
    return { rounds: [], error: "roundParticipationCheckFailed" }
  }
  try {
    // Load each required source once even outside a React render (e.g. actions).
    const [memberIsTest, allowedTestRoundIds] = await Promise.all([
      rounds.some((round) => round.is_test === false) ? readMemberIsTest(memberId) : false,
      rounds.some((round) => round.is_test === true) ? readMyTestRoundIds() : new Set<string>(),
    ])
    return {
      rounds: rounds.filter((round) => round.is_test ? allowedTestRoundIds.has(round.id) : !memberIsTest),
      error: null,
    }
  } catch {
    // Missing rows, denied reads, schema mismatches and RPC failures are unknown,
    // not evidence that the caller is absent from the allowed list.
    return { rounds: [], error: "roundParticipationCheckFailed" }
  }
}

export async function getRoundSubmissionAccess(round: RoundSubmissionScope, memberId: string): Promise<RoundSubmissionAccess> {
  const result = await filterSubmittableRounds([round], memberId)
  if (result.error) return { allowed: false, error: result.error }
  return result.rounds.length ? { allowed: true } : { allowed: false, error: "roundParticipationNotAllowed" }
}
