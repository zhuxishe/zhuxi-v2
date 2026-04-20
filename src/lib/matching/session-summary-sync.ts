import type { SupabaseClient } from "@supabase/supabase-js"
import { buildSessionSummary } from "./session-summary"

export async function syncSessionSummary(
  db: SupabaseClient<any, any, any>,
  sessionId: string,
) {
  const [{ data: session, error: sessionError }, { data: results, error: resultsError }] = await Promise.all([
    db.from("match_sessions").select("total_candidates").eq("id", sessionId).single(),
    db.from("match_results").select("status, member_a_id, member_b_id, group_members").eq("session_id", sessionId),
  ])

  if (sessionError) throw sessionError
  if (resultsError) throw resultsError
  const summary = buildSessionSummary(session?.total_candidates ?? 0, results ?? [])

  const { error: updateError } = await db
    .from("match_sessions")
    .update({
      total_matched: summary.totalMatched,
      total_unmatched: summary.totalUnmatched,
    })
    .eq("id", sessionId)

  if (updateError) throw updateError
}
