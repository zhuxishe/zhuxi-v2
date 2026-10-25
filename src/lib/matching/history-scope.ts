import { getSingleRelation } from "@/lib/supabase/relations"

export interface MatchingHistoryScope { isTestRound?: boolean }

/** Untagged legacy sessions remain formal history; test history stays in its own domain. */
export function isMatchingHistoryInScope(sessionValue: unknown, scope: MatchingHistoryScope = {}): boolean {
  const session = getSingleRelation(sessionValue as { round?: unknown; round_id?: string | null } | { round?: unknown; round_id?: string | null }[] | null)
  const round = getSingleRelation(session?.round as { is_test?: boolean } | { is_test?: boolean }[] | null)
  if (session?.round_id && !round) return false
  return (round?.is_test === true) === (scope.isTestRound === true)
}
