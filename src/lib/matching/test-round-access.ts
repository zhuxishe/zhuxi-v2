import { createClient } from "@/lib/supabase/server"
import { getSingleRelation } from "@/lib/supabase/relations"

function resultRound(value: unknown) {
  const session = getSingleRelation(value as { round?: unknown } | { round?: unknown }[] | null)
  return getSingleRelation(session?.round as { id?: string; is_test?: boolean } | { id?: string; is_test?: boolean }[] | null)
}

/** Service reads must repeat test-round access checks; service_role bypasses RLS. */
export async function filterAccessibleMatchingResults<T extends { session: unknown }>(results: T[]): Promise<T[]> {
  if (!results.some((result) => resultRound(result.session)?.is_test === true)) return results
  const db = await createClient()
  const { data, error } = await db.rpc("get_my_test_round_ids")
  if (error || !Array.isArray(data) || data.some((id) => typeof id !== "string")) {
    throw new Error("Unable to verify your matching activity access")
  }
  const allowed = new Set(data)
  return results.filter((result) => {
    const round = resultRound(result.session)
    return round?.is_test !== true || (typeof round.id === "string" && allowed.has(round.id))
  })
}
